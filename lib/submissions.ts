import "server-only"
import { db } from "@/lib/db"
import {
  sites,
  barbers,
  user as userTable,
  weeklyTakings,
  siteConfirmations,
  sublettingTakings,
  trainingWeeks,
  leaveRequests,
} from "@/lib/db/schema"
import { and, eq, gte, lte, sql } from "drizzle-orm"
import { fmtWeekLong, isPastSubmissionDeadline } from "@/lib/format"
import { getManualKpiResults } from "@/lib/data"

// Shift an ISO date string (YYYY-MM-DD) by a number of days, returning ISO.
// Uses UTC to avoid any timezone drift on the date-only value.
function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Weekly submission tracker — answers "who still hasn't entered their data for
// this week?" across every input the cadence depends on:
//   - Barber takings (per barbershop, all active barbers expected)
//   - Site confirmations (functional-leader weekly sign-off)
//   - Subletting income (sites that sublet)
//   - Training throughput (academy sites)
//   - Manual KPIs (HR + Marketing leads)
// Used by the in-app status board and the 18:00 leadership alert.
// ---------------------------------------------------------------------------

export type SubmissionCategory =
  | "Takings"
  | "Confirmation"
  | "Subletting"
  | "Training"
  | "KPI"

export type SubmissionItem = {
  key: string
  category: SubmissionCategory
  label: string
  ownerRole: string
  submitted: boolean
  detail: string
  /** Site this item belongs to (Takings/Confirmation/Subletting/Training).
   *  Null for group-level items such as HR/Marketing KPIs. Used to route the
   *  urgent confirmation prompt to the responsible site manager. */
  siteId: number | null
  /** True when the underlying figures are in but the explicit weekly sign-off
   *  is still pending — i.e. the item just needs a manager to click "Confirm",
   *  not fresh data entry. Lets leadership tell "awaiting sign-off" apart from
   *  "nothing entered" on the submissions board. */
  awaitingConfirmation: boolean
}

export type SubmissionCategorySummary = {
  category: SubmissionCategory
  total: number
  submitted: number
}

export type SubmissionSummary = {
  week: string
  weekLabel: string
  items: SubmissionItem[]
  outstanding: SubmissionItem[]
  total: number
  submittedCount: number
  outstandingCount: number
  /** How many outstanding items are merely awaiting a confirmation click
   *  (figures already in) rather than missing data entirely. */
  awaitingConfirmationCount: number
  pct: number
  complete: boolean
  byCategory: SubmissionCategorySummary[]
  /** Whether the 18:00 Saturday submission deadline for this week has passed.
   *  Before the deadline, unsubmitted items are "awaited", not overdue. */
  pastDeadline: boolean
  /** Unsubmitted items that are genuinely overdue (deadline passed). Empty
   *  before the Saturday 6pm deadline. */
  overdue: SubmissionItem[]
  overdueCount: number
}

/** Build the full submission status for a given week. */
export async function getSubmissionStatus(
  week: string,
): Promise<SubmissionSummary> {
  // The week runs Sunday..Saturday; `week` is the Saturday (weekEnding). Derive
  // the Sunday so we can test whether an approved holiday overlaps this week.
  const weekStart = addDays(week, -6)

  const [
    siteRows,
    takingsRows,
    confirmRows,
    subletSiteIds,
    subletWeekRows,
    trainingWeekRows,
    activeBarberRows,
    holidayRows,
  ] = await Promise.all([
    db.select().from(sites),
    db
      .select({
        siteId: weeklyTakings.siteId,
        count: sql<number>`count(distinct ${weeklyTakings.barberId})`,
      })
      .from(weeklyTakings)
      .where(eq(weeklyTakings.weekEnding, week))
      .groupBy(weeklyTakings.siteId),
    db
      .select({
        siteId: siteConfirmations.siteId,
        confirmed: siteConfirmations.confirmed,
      })
      .from(siteConfirmations)
      .where(eq(siteConfirmations.weekEnding, week)),
    // Sites that have ever recorded subletting income (so they're expected to).
    db
      .select({ siteId: sublettingTakings.siteId })
      .from(sublettingTakings)
      .groupBy(sublettingTakings.siteId),
    db
      .select({ siteId: sublettingTakings.siteId })
      .from(sublettingTakings)
      .where(eq(sublettingTakings.weekEnding, week)),
    db
      .select({ siteId: trainingWeeks.siteId, confirmed: trainingWeeks.confirmed })
      .from(trainingWeeks)
      .where(eq(trainingWeeks.weekEnding, week)),
    // The live roster: active barbers per site. This is who is actually expected
    // to report takings — NOT the site's chair capacity (sites.headcount).
    db
      .select({ id: barbers.id, siteId: barbers.siteId })
      .from(barbers)
      .where(eq(barbers.active, true)),
    // Approved holidays overlapping this week — those barbers are not expected
    // to submit takings, so they don't count against completeness.
    db
      .select({ barberId: leaveRequests.barberId })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.kind, "holiday"),
          eq(leaveRequests.status, "Approved"),
          lte(leaveRequests.startDate, week),
          gte(leaveRequests.endDate, weekStart),
        ),
      ),
  ])

  const reportingBySite = new Map(
    takingsRows.map((r) => [r.siteId, Number(r.count)]),
  )
  const confirmedSites = new Set(
    confirmRows.filter((r) => r.confirmed).map((r) => r.siteId),
  )
  const subletExpected = new Set(subletSiteIds.map((r) => r.siteId))
  const subletSubmitted = new Set(subletWeekRows.map((r) => r.siteId))
  const trainingSubmitted = new Set(trainingWeekRows.map((r) => r.siteId))
  const trainingConfirmed = new Set(
    trainingWeekRows.filter((r) => r.confirmed).map((r) => r.siteId),
  )

  // Expected submitters per site = active barbers, minus anyone on approved
  // holiday this week. Chair capacity (sites.headcount) is NOT used here — an
  // empty chair or a departed barber must never keep a week outstanding.
  const onHoliday = new Set(holidayRows.map((r) => r.barberId))
  const activeBySite = new Map<number, number>()
  const holidayBySite = new Map<number, number>()
  for (const b of activeBarberRows) {
    if (onHoliday.has(b.id)) {
      holidayBySite.set(b.siteId, (holidayBySite.get(b.siteId) ?? 0) + 1)
    } else {
      activeBySite.set(b.siteId, (activeBySite.get(b.siteId) ?? 0) + 1)
    }
  }

  const items: SubmissionItem[] = []

  for (const s of siteRows) {
    const isTraining = s.siteType === "training"

    if (isTraining) {
      // Training site -> expect a training_weeks entry AND an explicit
      // confirmation. Entering the figures alone no longer counts as done.
      const entered = trainingSubmitted.has(s.id)
      const confirmed = trainingConfirmed.has(s.id)
      items.push({
        key: `training-${s.id}`,
        category: "Training",
        label: `${s.name} — training throughput`,
        ownerRole: "Training Lead",
        siteId: s.id,
        submitted: confirmed,
        awaitingConfirmation: entered && !confirmed,
        detail: confirmed
          ? "Confirmed"
          : entered
            ? "Entered, not confirmed"
            : "No learners/apprentices entered",
      })
    } else {
      // Barbershop -> expected submitters are the ACTIVE roster minus anyone on
      // approved holiday this week. Chair capacity (sites.headcount) is not the
      // yardstick: 8 chairs with 7 working barbers should complete at 7/7, and
      // a barber on approved leave shouldn't hold the week open.
      const expected = activeBySite.get(s.id) ?? 0
      const holidaying = holidayBySite.get(s.id) ?? 0
      const reporting = reportingBySite.get(s.id) ?? 0
      // Complete when every expected barber has takings in. Expected 0 (no
      // active barbers rostered) means there is nothing to collect -> not
      // outstanding.
      const takingsSubmitted = reporting >= expected
      items.push({
        key: `takings-${s.id}`,
        category: "Takings",
        label: `${s.name} — barber takings`,
        ownerRole: s.managerName ? `${s.managerName} (Manager)` : "Site Manager",
        siteId: s.id,
        submitted: takingsSubmitted,
        awaitingConfirmation: false,
        detail:
          expected === 0
            ? "No active barbers rostered"
            : `${reporting}/${expected} barbers entered${
                holidaying > 0 ? ` · ${holidaying} on holiday` : ""
              }`,
      })

      // A weekly confirmation only counts when the underlying takings are
      // actually in — you cannot validly sign off a week with no figures.
      const confirmed = confirmedSites.has(s.id)
      const confirmationValid = confirmed && takingsSubmitted
      items.push({
        key: `confirm-${s.id}`,
        category: "Confirmation",
        label: `${s.name} — weekly confirmation`,
        ownerRole: "Functional Leader",
        siteId: s.id,
        submitted: confirmationValid,
        awaitingConfirmation: takingsSubmitted && !confirmed,
        detail: confirmationValid
          ? "Confirmed"
          : confirmed
            ? "Confirmed but takings missing"
            : "Not confirmed",
      })
    }

    // Subletting expectation applies to any site that has sublet before.
    if (subletExpected.has(s.id)) {
      items.push({
        key: `sublet-${s.id}`,
        category: "Subletting",
        label: `${s.name} — subletting income`,
        ownerRole: "Operations",
        siteId: s.id,
        submitted: subletSubmitted.has(s.id),
        awaitingConfirmation: false,
        detail: subletSubmitted.has(s.id) ? "Entered" : "Not entered",
      })
    }
  }

  // ---- Manual KPI areas (HR + Marketing) ----------------------------------
  for (const area of ["HR", "Marketing"] as const) {
    const results = await getManualKpiResults(area, week)
    if (results.length === 0) continue
    const enteredCount = results.filter((r) => r.entered).length
    items.push({
      key: `kpi-${area}`,
      category: "KPI",
      label: `${area} — weekly KPIs`,
      ownerRole: area === "HR" ? "HR Lead" : "Social Media",
      siteId: null,
      submitted: enteredCount === results.length,
      awaitingConfirmation: false,
      detail: `${enteredCount}/${results.length} KPIs entered`,
    })
  }

  const outstanding = items.filter((i) => !i.submitted)
  const submittedCount = items.length - outstanding.length
  const total = items.length
  const pct = total === 0 ? 100 : Math.round((submittedCount / total) * 100)

  // Submissions are only "overdue" once the 18:00 Saturday deadline has passed.
  // Before then, unsubmitted items are simply still awaited.
  const pastDeadline = isPastSubmissionDeadline(week)
  const overdue = pastDeadline ? outstanding : []

  const categories: SubmissionCategory[] = [
    "Takings",
    "Confirmation",
    "Subletting",
    "Training",
    "KPI",
  ]
  const byCategory: SubmissionCategorySummary[] = categories
    .map((category) => {
      const inCat = items.filter((i) => i.category === category)
      return {
        category,
        total: inCat.length,
        submitted: inCat.filter((i) => i.submitted).length,
      }
    })
    .filter((c) => c.total > 0)

  return {
    week,
    weekLabel: fmtWeekLong(week),
    items,
    outstanding,
    total,
    submittedCount,
    outstandingCount: outstanding.length,
    awaitingConfirmationCount: outstanding.filter((i) => i.awaitingConfirmation)
      .length,
    pct,
    complete: outstanding.length === 0,
    byCategory,
    pastDeadline,
    overdue,
    overdueCount: overdue.length,
  }
}

/**
 * The in-app URL that resolves a single submission item, so a board row taps
 * straight through to the exact page + week. Mirrors the email deep-links in
 * lib/weekly-workflow.ts, but returns a relative path for client navigation.
 */
export function submissionHref(item: SubmissionItem, week: string): string {
  const w = `week=${encodeURIComponent(week)}`
  switch (item.category) {
    case "Takings":
      return `/data-entry?${w}${item.siteId != null ? `#site-${item.siteId}` : ""}`
    case "Confirmation":
    case "Subletting":
      return item.siteId != null ? `/my-site/${item.siteId}?${w}` : `/data-entry?${w}`
    case "Training":
      return `/functions/Training/input?${w}`
    case "KPI":
      return item.label.toLowerCase().startsWith("hr")
        ? `/functions/HR/input?${w}`
        : `/functions/Marketing/input?${w}`
    default:
      return `/data-entry?${w}`
  }
}

export type SiteManagerContact = {
  siteId: number
  siteName: string
  managerName: string | null
  /** Resolved login emails for whoever runs this site (may be more than one,
   *  e.g. a co-managed site). Empty when no manager account can be resolved. */
  emails: string[]
}

/**
 * Resolve the responsible manager email(s) for each site, used to route the
 * urgent confirmation prompt. A site's manager is any active barber whose role
 * contains "manager" OR whose name appears in sites.manager_name (which can be
 * a "Cosmin / Mario" style pairing), linked to a Better Auth login for the
 * email. Sites with no resolvable manager return an empty email list so the
 * caller can fall back to the owners.
 */
export async function getSiteManagerContacts(): Promise<
  Map<number, SiteManagerContact>
> {
  const [siteRows, managerRows] = await Promise.all([
    db.select({ id: sites.id, name: sites.name, managerName: sites.managerName }).from(sites),
    db
      .select({
        siteId: barbers.siteId,
        barberName: barbers.name,
        role: barbers.role,
        email: userTable.email,
      })
      .from(barbers)
      .innerJoin(userTable, eq(userTable.id, barbers.userId))
      .where(eq(barbers.active, true)),
  ])

  const result = new Map<number, SiteManagerContact>()
  for (const s of siteRows) {
    const declaredNames = (s.managerName ?? "")
      .split(/[\/,&]|\band\b/i)
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean)

    const siteBarbers = managerRows.filter((m) => m.siteId === s.id)

    // Prefer the people actually NAMED as this site's manager (handles
    // "Cosmin / Mario" pairings). This avoids sweeping in area leads who merely
    // carry a "manager" role while based at the same site (e.g. Training/HR
    // leads sitting at LTZ Soresby).
    const named = siteBarbers.filter((m) =>
      declaredNames.some((n) => m.barberName.toLowerCase().includes(n)),
    )
    // If nobody on this site's roster matches the declared name, search ALL
    // active barbers by name. This handles a manager who runs one site but is
    // rostered at another (e.g. Ravi manages the Training Academy but is on the
    // LTZ Soresby roster).
    const namedAnywhere =
      named.length > 0
        ? named
        : declaredNames.length > 0
          ? managerRows.filter((m) =>
              declaredNames.some((n) => m.barberName.toLowerCase().includes(n)),
            )
          : []
    // Fall back to role-based matching only when nobody is named (e.g. a site
    // whose manager_name isn't a person's name, so we use the "Manager" role).
    const matched =
      namedAnywhere.length > 0
        ? namedAnywhere
        : siteBarbers.filter((m) =>
            (m.role ?? "").toLowerCase().includes("manager"),
          )

    result.set(s.id, {
      siteId: s.id,
      siteName: s.name,
      managerName: s.managerName,
      emails: [...new Set(matched.map((m) => m.email.toLowerCase()))],
    })
  }
  return result
}
