import "server-only"
import { db } from "@/lib/db"
import {
  sites,
  barbers,
  weeklyTakings,
  siteConfirmations,
  actions,
  sublettingTakings,
} from "@/lib/db/schema"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import {
  type Rag,
  rollUpRag,
  ragFromAttainment,
  fmtGBP,
  fmtWeek,
  fmtWeekLong,
} from "@/lib/format"
import { ragForSublet, SUBLET_WEEKLY_TARGET } from "@/lib/subletting-config"
import { VISION } from "@/lib/vision"
import { perBarberWeeklyRevenue, tierForBrand, RTB_PER_BARBER_WEEKLY } from "@/lib/plan"
import {
  ragForUtilisation,
  ragForRtb,
  ragForTraining,
} from "@/lib/capacity-config"
import {
  trainingRevenue as calcTrainingRevenue,
  trainingRevenueTarget,
} from "@/lib/training-config"
import { effectiveBarberPct } from "@/lib/split-config"
import {
  trainingWeeks,
  user as userTable,
  kpis,
  kpiValues,
} from "@/lib/db/schema"
import { FUNCTION_AREAS, canonicalAreaKey, ACTIONS_SCORED_AREAS } from "@/lib/function-areas"
import {
  kpisForArea,
  kpisForBrand,
  isPerBrandArea,
  KPI_BRANDS,
  scoreKpi,
  rollUpWeighted,
  AREA_WEIGHTS,
  type WeightedRag,
} from "@/lib/kpi-config"

export type { Rag }
export { rollUpRag, ragFromAttainment, fmtGBP, fmtWeek, fmtWeekLong }

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

export async function getWeeks(): Promise<string[]> {
  const rows = await db
    .select({ week: weeklyTakings.weekEnding })
    .from(weeklyTakings)
    .groupBy(weeklyTakings.weekEnding)
    .orderBy(desc(weeklyTakings.weekEnding))
  return rows.map((r) => String(r.week))
}

export async function getLatestWeek(): Promise<string | null> {
  const weeks = await getWeeks()
  return weeks[0] ?? null
}

function prevWeekOf(weeks: string[], week: string): string | null {
  const i = weeks.indexOf(week)
  return i >= 0 && i + 1 < weeks.length ? weeks[i + 1] : null
}

// ---------------------------------------------------------------------------
// Group summary for a given week
// ---------------------------------------------------------------------------

export type GroupSummary = {
  week: string
  prevWeek: string | null
  groupRag: Rag
  weekRevenue: number
  prevWeekRevenue: number
  weekTarget: number
  attainmentPct: number
  wowPct: number
  activeBarbers: number
  reportingBarbers: number
  // Group chair staffing: total headcount (staffed chairs) vs total capacity.
  totalHeadcount: number
  totalCapacity: number
  capacityRag: Rag
  siteCount: number
  confirmedSites: number
  avgPerBarber: number
  openActions: number
  escalatedActions: number
  ragCounts: Record<Rag, number>
  // Group takings breakdown (chair + sublet + training).
  revenue: GroupRevenueBreakdown
}

// Group weekly takings = chair takings (all sites) + subletting income +
// training income (private learners x £92). Targets are combined the same way.
export type GroupRevenueBreakdown = {
  week: string
  chairRevenue: number
  subletRevenue: number
  trainingRevenue: number
  total: number
  chairTarget: number
  subletTarget: number
  trainingTarget: number
  totalTarget: number
}

async function chairTargetTotal(): Promise<number> {
  const [t] = await db
    .select({ t: sql<number>`coalesce(sum(${barbers.targetWeekly}), 0)` })
    .from(barbers)
    .where(eq(barbers.active, true))
  return Number(t?.t ?? 0)
}

export async function getGroupRevenueBreakdown(
  week: string,
): Promise<GroupRevenueBreakdown> {
  const [chair] = await db
    .select({ total: sql<number>`coalesce(sum(${weeklyTakings.total}), 0)` })
    .from(weeklyTakings)
    .where(eq(weeklyTakings.weekEnding, week))

  const [sublet] = await db
    .select({
      amount: sql<number>`coalesce(sum(${sublettingTakings.amount}), 0)`,
      target: sql<number>`coalesce(sum(${sublettingTakings.target}), 0)`,
      rows: sql<number>`count(*)`,
    })
    .from(sublettingTakings)
    .where(eq(sublettingTakings.weekEnding, week))

  // Training revenue: actual = reported private learners x £92; target =
  // each academy site's learner capacity x £92.
  const trainRows = await db
    .select()
    .from(trainingWeeks)
    .where(eq(trainingWeeks.weekEnding, week))
  const trainingActual = trainRows.reduce(
    (a, r) => a + calcTrainingRevenue(Number(r.privateLearners)),
    0,
  )
  const academySites = await db
    .select({ cap: sites.learnerCapacity })
    .from(sites)
    .where(eq(sites.siteType, "training"))
  const trainingTarget = academySites.reduce(
    (a, s) => a + trainingRevenueTarget(Number(s.cap ?? 0)),
    0,
  )

  const chairRevenue = Number(chair?.total ?? 0)
  // Subletting is declared periodically (not every week). When the selected
  // week has no entry, carry forward the most recently declared week so the
  // dashboard reflects the latest known position rather than collapsing to £0
  // (which previously read as 100% / green against a £0 target).
  let subletRevenue = Number(sublet?.amount ?? 0)
  let subletRows = Number(sublet?.rows ?? 0)
  if (subletRows === 0) {
    const [carry] = await db
      .select({
        amount: sql<number>`coalesce(sum(${sublettingTakings.amount}), 0)`,
        week: sublettingTakings.weekEnding,
      })
      .from(sublettingTakings)
      .where(sql`${sublettingTakings.weekEnding} <= ${week}`)
      .groupBy(sublettingTakings.weekEnding)
      .orderBy(desc(sublettingTakings.weekEnding))
      .limit(1)
    if (carry) {
      subletRevenue = Number(carry.amount ?? 0)
      subletRows = 1
    }
  }
  // Target is always the fixed weekly policy target (£950) whenever subletting
  // is tracked at all — never a £0 target derived from missing rows.
  const subletTarget = subletRows > 0 ? SUBLET_WEEKLY_TARGET : 0
  const chairTarget = await chairTargetTotal()

  return {
    week,
    chairRevenue,
    subletRevenue,
    trainingRevenue: trainingActual,
    total: chairRevenue + subletRevenue + trainingActual,
    chairTarget,
    subletTarget,
    trainingTarget,
    totalTarget: chairTarget + subletTarget + trainingTarget,
  }
}

export async function getGroupSummary(week: string): Promise<GroupSummary> {
  const weeks = await getWeeks()
  const prevWeek = prevWeekOf(weeks, week)

  const siteRows = await getSiteWeek(week)
  const revenue = await getGroupRevenueBreakdown(week)
  // Group takings = chair + sublet + training (all sites and income streams).
  const weekRevenue = revenue.total
  const weekTarget = revenue.totalTarget
  const prevRevenue = prevWeek
    ? await getGroupRevenueBreakdown(prevWeek)
    : null
  const prevWeekRevenue = prevRevenue?.total ?? 0
  const reportingBarbers = siteRows.reduce((a, s) => a + s.reportingBarbers, 0)

  // Group chair staffing: sum of staffed chairs (headcount) vs total chair
  // capacity across all barbershop sites. RAG: green at/above capacity, amber
  // within 10% under, red anything lower.
  const shopRows = siteRows.filter((s) => s.siteType === "barbershop")
  const totalHeadcount = shopRows.reduce((a, s) => a + s.activeBarbers, 0)
  const totalCapacity = shopRows.reduce((a, s) => a + s.chairCapacity, 0)
  const capacityRag = ragForUtilisation(totalHeadcount, totalCapacity)

  const [barberCount] = await db
    .select({ c: sql<number>`count(*)` })
    .from(barbers)
    .where(eq(barbers.active, true))

  const [actionAgg] = await db
    .select({
      open: sql<number>`count(*) filter (where ${actions.status} <> 'Closed')`,
      escalated: sql<number>`count(*) filter (where ${actions.escalated} = true and ${actions.status} <> 'Closed')`,
    })
    .from(actions)

  const confirmedSites = siteRows.filter((s) => s.confirmed).length

  const ragCounts: Record<Rag, number> = { green: 0, amber: 0, red: 0 }
  for (const s of siteRows) ragCounts[s.rag]++

  const attainmentPct = weekTarget > 0 ? (weekRevenue / weekTarget) * 100 : 0
  const wowPct =
    prevWeekRevenue > 0
      ? ((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100
      : 0

  return {
    week,
    prevWeek,
    groupRag: rollUpRag(siteRows.map((s) => s.rag)),
    weekRevenue,
    prevWeekRevenue,
    weekTarget,
    attainmentPct,
    wowPct,
    activeBarbers: Number(barberCount?.c ?? 0),
    reportingBarbers,
    totalHeadcount,
    totalCapacity,
    capacityRag,
    siteCount: siteRows.length,
    confirmedSites,
    avgPerBarber: reportingBarbers > 0 ? weekRevenue / reportingBarbers : 0,
    openActions: Number(actionAgg?.open ?? 0),
    escalatedActions: Number(actionAgg?.escalated ?? 0),
    ragCounts,
    revenue,
  }
}

// ---------------------------------------------------------------------------
// Site-level weekly performance
// ---------------------------------------------------------------------------

export type SiteWeekRow = {
  id: number
  name: string
  location: string
  brand: string
  region: string | null
  managerName: string | null
  headcount: number
  weekTarget: number
  weekRevenue: number
  attainmentPct: number
  rag: Rag
  reportingBarbers: number
  totalBarbers: number
  confirmed: boolean
  confirmedBy: string | null
  // Capacity KPIs (folded into rag).
  siteType: string
  chairCapacity: number
  activeBarbers: number
  utilisationRag: Rag
  rtbExpected: number
  rtbActual: number
  rtbRag: Rag
  trainingRag: Rag
}

export async function getSiteWeek(week: string): Promise<SiteWeekRow[]> {
  // Training/academy sites always sort last (after the barbershops).
  const siteRows = await db
    .select()
    .from(sites)
    .orderBy(
      sql`case when ${sites.siteType} = 'training' then 1 else 0 end`,
      sites.name,
    )

  const targetAgg = await db
    .select({
      siteId: barbers.siteId,
      target: sql<number>`coalesce(sum(${barbers.targetWeekly}), 0)`,
      total: sql<number>`count(*)`,
    })
    .from(barbers)
    .where(eq(barbers.active, true))
    .groupBy(barbers.siteId)

  const revAgg = await db
    .select({
      siteId: weeklyTakings.siteId,
      revenue: sql<number>`coalesce(sum(${weeklyTakings.total}), 0)`,
      rent: sql<number>`coalesce(sum(${weeklyTakings.cashRent} + ${weeklyTakings.cardRent}), 0)`,
      reporting: sql<number>`count(distinct ${weeklyTakings.barberId})`,
    })
    .from(weeklyTakings)
    .where(eq(weeklyTakings.weekEnding, week))
    .groupBy(weeklyTakings.siteId)

  const confirmRows = await db
    .select()
    .from(siteConfirmations)
    .where(eq(siteConfirmations.weekEnding, week))

  const trainingRows = await db
    .select()
    .from(trainingWeeks)
    .where(eq(trainingWeeks.weekEnding, week))

  return siteRows.map((s) => {
    const t = targetAgg.find((r) => r.siteId === s.id)
    const rev = revAgg.find((r) => r.siteId === s.id)
    const conf = confirmRows.find((c) => c.siteId === s.id)
    const weekTarget = Number(t?.target ?? 0)
    const weekRevenue = Number(rev?.revenue ?? 0)
    const attainmentPct = weekTarget > 0 ? (weekRevenue / weekTarget) * 100 : 0
    const activeBarbers = Number(t?.total ?? 0)
    const siteType = s.siteType ?? "barbershop"

    // Capacity / RTB (barbershops).
    const chairCapacity = s.chairCapacity ?? 0
    // Headcount-confirmed sites (e.g. F.AF) have no per-barber rows, so treat
    // the confirmed headcount as staffed chairs when it is higher. A site can
    // never staff more chairs than it physically has, so cap at chairCapacity
    // (otherwise sites with more barber records than chairs report >100%
    // utilisation and inflate the group capacity figure).
    const staffedChairs = Math.min(
      Math.max(activeBarbers, s.headcount ?? 0),
      chairCapacity,
    )
    const utilisationRag = ragForUtilisation(staffedChairs, chairCapacity)
    const rtbActual = Number(rev?.rent ?? 0)
    const rtbExpected = activeBarbers * Number(s.rtbPerBarber ?? 500)
    const rtbReported = Number(rev?.reporting ?? 0) > 0
    const rtbRag = rtbReported ? ragForRtb(rtbActual, rtbExpected) : "red"

    // Training throughput (academy sites).
    const tw = trainingRows.find((r) => r.siteId === s.id)
    const trainingRag =
      siteType === "training"
        ? tw
          ? ragForTraining(
              Number(tw.privateLearners),
              s.learnerCapacity ?? 0,
              Number(tw.apprentices),
              s.apprenticeCapacity ?? 0,
            )
          : "red"
        : "green"

    // Overall site RAG = worst of revenue attainment + capacity KPIs.
    const revenueRag: Rag =
      siteType === "training"
        ? "green"
        : weekRevenue === 0
          ? "red"
          : ragFromAttainment(attainmentPct)
    const componentRags: Rag[] =
      siteType === "training"
        ? [trainingRag]
        : [revenueRag, utilisationRag, rtbRag]

    return {
      id: s.id,
      name: s.name,
      location: s.location,
      brand: s.brand,
      region: s.region,
      managerName: s.managerName,
      headcount: s.headcount ?? 0,
      weekTarget,
      weekRevenue,
      attainmentPct,
      rag: rollUpRag(componentRags),
      reportingBarbers: Number(rev?.reporting ?? 0),
      totalBarbers: activeBarbers,
      confirmed: conf?.confirmed ?? false,
      confirmedBy: conf?.confirmedBy ?? null,
      siteType,
      chairCapacity,
      activeBarbers: staffedChairs,
      utilisationRag,
      rtbExpected,
      rtbActual,
      rtbRag,
      trainingRag,
    }
  })
}

export async function getSite(id: number) {
  const [s] = await db.select().from(sites).where(eq(sites.id, id))
  return s ?? null
}

// ---------------------------------------------------------------------------
// Group revenue trend (per week)
// ---------------------------------------------------------------------------

export type TrendPoint = { week: string; label: string; revenue: number; target: number }

export async function getGroupTrend(): Promise<TrendPoint[]> {
  // Chair takings per week.
  const chairRows = await db
    .select({
      week: weeklyTakings.weekEnding,
      revenue: sql<number>`coalesce(sum(${weeklyTakings.total}), 0)`,
    })
    .from(weeklyTakings)
    .groupBy(weeklyTakings.weekEnding)
    .orderBy(asc(weeklyTakings.weekEnding))

  // Subletting income per week.
  const subletRows = await db
    .select({
      week: sublettingTakings.weekEnding,
      amount: sql<number>`coalesce(sum(${sublettingTakings.amount}), 0)`,
    })
    .from(sublettingTakings)
    .groupBy(sublettingTakings.weekEnding)

  // Training income per week (private learners x £92).
  const trainRows = await db
    .select({
      week: trainingWeeks.weekEnding,
      learners: sql<number>`coalesce(sum(${trainingWeeks.privateLearners}), 0)`,
    })
    .from(trainingWeeks)
    .groupBy(trainingWeeks.weekEnding)

  const subletByWeek = new Map(
    subletRows.map((r) => [String(r.week), Number(r.amount)]),
  )
  const trainByWeek = new Map(
    trainRows.map((r) => [String(r.week), calcTrainingRevenue(Number(r.learners))]),
  )

  // Combined weekly target: chair targets + sublet targets + training target.
  const chairTarget = await chairTargetTotal()
  const [subletTargetRow] = await db
    .select({
      t: sql<number>`coalesce(sum(${sublettingTakings.target}), 0)`,
      weeks: sql<number>`count(distinct ${sublettingTakings.weekEnding})`,
    })
    .from(sublettingTakings)
  const subletTargetWeekly =
    Number(subletTargetRow?.weeks ?? 0) > 0
      ? Number(subletTargetRow?.t ?? 0) / Number(subletTargetRow?.weeks)
      : 0
  const academySites = await db
    .select({ cap: sites.learnerCapacity })
    .from(sites)
    .where(eq(sites.siteType, "training"))
  const trainingTargetWeekly = academySites.reduce(
    (a, s) => a + trainingRevenueTarget(Number(s.cap ?? 0)),
    0,
  )
  const weekTarget = chairTarget + subletTargetWeekly + trainingTargetWeekly

  return chairRows.map((r) => {
    const wk = String(r.week)
    const total =
      Number(r.revenue) + (subletByWeek.get(wk) ?? 0) + (trainByWeek.get(wk) ?? 0)
    return {
      week: wk,
      label: fmtWeek(wk),
      revenue: Math.round(total),
      target: Math.round(weekTarget),
    }
  })
}

// ---------------------------------------------------------------------------
// Barber leaderboard for a week (group-wide)
// ---------------------------------------------------------------------------

export type BarberWeekRow = {
  id: number
  name: string
  role: string
  siteName: string
  targetWeekly: number
  revenue: number
  prevRevenue: number
  attainmentPct: number
  rag: Rag
  cash: number
  card: number
  manager: string
  comments: string | null
  reported: boolean
}

export async function getBarberWeek(
  week: string,
  siteId?: number,
): Promise<BarberWeekRow[]> {
  const weeks = await getWeeks()
  const prevWeek = prevWeekOf(weeks, week)

  const barberRows = await db
    .select()
    .from(barbers)
    .where(
      siteId
        ? and(eq(barbers.active, true), eq(barbers.siteId, siteId))
        : eq(barbers.active, true),
    )

  const siteRows = await db.select().from(sites)

  const takingRows = await db
    .select()
    .from(weeklyTakings)
    .where(eq(weeklyTakings.weekEnding, week))

  const prevRows = prevWeek
    ? await db
        .select()
        .from(weeklyTakings)
        .where(eq(weeklyTakings.weekEnding, prevWeek))
    : []

  // Per-barber weekly gross target comes from the plan's brand tier (Mid £50k /
  // Youth £40k / Elite £60k per year, +10%/yr), resolved from the barber's site
  // brand and the current plan year. RTB is the 50% house share. A barber's own
  // stored target overrides it only if it is higher.
  const planYear = new Date(week).getFullYear()

  return barberRows
    .map((b) => {
      const t = takingRows.find((r) => r.barberId === b.id)
      const p = prevRows.find((r) => r.barberId === b.id)
      const revenue = t ? Number(t.total) : 0
      const barberSite = siteRows.find((s) => s.id === b.siteId)
      const visionGrossTarget = perBarberWeeklyRevenue(
        tierForBrand(barberSite?.brand),
        planYear,
      )
      const target = Math.max(visionGrossTarget, Number(b.targetWeekly))
      const attainmentPct = target > 0 ? (revenue / target) * 100 : 0
      return {
        id: b.id,
        name: b.name,
        role: b.role,
        siteName: siteRows.find((s) => s.id === b.siteId)?.name ?? "—",
        targetWeekly: target,
        revenue,
        prevRevenue: p ? Number(p.total) : 0,
        attainmentPct,
        rag: !t ? "red" : ragFromAttainment(attainmentPct),
        cash: t ? Number(t.cash) : 0,
        card: t ? Number(t.card) : 0,
        manager: t?.manager ?? "",
        comments: t?.comments ?? null,
        reported: !!t,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

/** A barber's full weekly history. */
export async function getBarberHistory(barberId: number) {
  const rows = await db
    .select()
    .from(weeklyTakings)
    .where(eq(weeklyTakings.barberId, barberId))
    .orderBy(asc(weeklyTakings.weekEnding))
  return rows.map((r) => ({
    week: String(r.weekEnding),
    label: fmtWeek(String(r.weekEnding)),
    total: Number(r.total),
    cash: Number(r.cash),
    card: Number(r.card),
    comments: r.comments,
  }))
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ActionRow = {
  id: number
  title: string
  description: string | null
  functionArea: string
  siteName: string | null
  owner: string
  ownerUserId: string | null
  ownerName: string | null
  // Always-safe owner display (never a raw user id); "Unassigned" if none.
  ownerLabel: string
  // RAID classification: "Risk" | "Issue" | "Action".
  entryType: string
  priority: string
  status: string
  rag: Rag
  // True when `rag` is a manual pin; false when auto-calculated.
  ragOverridden: boolean
  dueDate: string | null
  escalated: boolean
  // True when the auto-escalation engine raised it (vs a manual escalation).
  autoEscalated: boolean
  // Human-readable reason the item was escalated, if any.
  escalationReason: string | null
  isRisk: boolean
  // Derived: open (not Closed) with a due date in the past.
  overdue: boolean
  // Whole days past the due date (0 if not overdue / no due date).
  daysOverdue: number
}

/**
 * Resolve a free-text owner into a friendly label. Better Auth user ids are
 * long opaque tokens; if the owner text is actually one of those (a legacy
 * value), resolve it to the user's name. Returns null if the value is empty.
 */
function friendlyOwner(
  owner: string | null,
  users: { id: string; name: string | null }[],
): string | null {
  const text = (owner ?? "").trim()
  if (!text) return null
  // A Better Auth id is a ~16+ char token with no spaces — never a real label.
  const looksLikeId = !text.includes(" ") && /^[A-Za-z0-9]{16,}$/.test(text)
  if (looksLikeId) {
    return users.find((u) => u.id === text)?.name ?? null
  }
  return text
}

/** Days an open action is past its due date (0 if none/closed/future). */
export function computeOverdue(
  dueDate: string | null,
  status: string,
  now: Date = new Date(),
): { overdue: boolean; daysOverdue: number } {
  if (!dueDate || status === "Closed") return { overdue: false, daysOverdue: 0 }
  const due = new Date(dueDate + "T00:00:00")
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = today.getTime() - due.getTime()
  if (diffMs <= 0) return { overdue: false, daysOverdue: 0 }
  return { overdue: true, daysOverdue: Math.floor(diffMs / 86_400_000) }
}

// Function areas that represent the 5x5 expansion plan. Any open item tagged to
// one of these is automatically RED until it is closed — the 5x5 plan is the
// board's top priority, so an unfinished 5x5 item can never read green/amber.
const FIVE_BY_FIVE_AREAS = new Set(["Strategy", "Expansion", "Expansion Strategy"])

/** Whole days since a date (0 if missing/future). */
function daysSince(date: Date | string | null, now: Date = new Date()): number {
  if (!date) return 0
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return 0
  const diff = now.getTime() - d.getTime()
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000)
}

/**
 * Compute the effective RAG for an action from its age, priority, KPI flag and
 * the 5x5 (Strategy) rule. Returns the worst applicable colour. A manual
 * `ragOverride` short-circuits everything so leadership can pin a colour.
 *
 * Rules (worst wins), for open (non-Closed) items only:
 *  - Manual override → that colour.
 *  - Closed → green.
 *  - 5x5 / Strategy area → red (top priority, red until done).
 *  - Overdue: High priority red immediately; Medium red after 3 days (amber
 *    before); Low red after 7 days (amber before).
 *  - Age since raised with no resolution: High → amber 7d / red 21d;
 *    Medium → amber 21d / red 45d; Low → amber 45d / red 90d.
 *  - Otherwise green.
 */
export function computeAutoRag(opts: {
  status: string
  priority: string
  functionArea: string
  dueDate: string | null
  createdAt: Date | string | null
  ragOverride?: string | null
  now?: Date
}): Rag {
  const now = opts.now ?? new Date()

  // Manual pin always wins.
  if (opts.ragOverride && ["red", "amber", "green"].includes(opts.ragOverride)) {
    return opts.ragOverride as Rag
  }
  if (opts.status === "Closed") return "green"

  const priority = opts.priority || "Medium"
  let worst: Rag = "green"
  const escalate = (r: Rag) => {
    const rank: Record<Rag, number> = { green: 2, amber: 1, red: 0 }
    if (rank[r] < rank[worst]) worst = r
  }

  // 5x5 expansion plan — red until closed.
  if (FIVE_BY_FIVE_AREAS.has(canonicalAreaKey(opts.functionArea))) {
    escalate("red")
  }

  // Overdue escalation, weighted by priority.
  const { overdue, daysOverdue } = computeOverdue(opts.dueDate, opts.status, now)
  if (overdue) {
    if (priority === "High") escalate("red")
    else if (priority === "Medium") escalate(daysOverdue >= 3 ? "red" : "amber")
    else escalate(daysOverdue >= 7 ? "red" : "amber")
  }

  // Age since raised (the action lingering open), weighted by priority.
  const age = daysSince(opts.createdAt, now)
  const ageThresholds: Record<string, { amber: number; red: number }> = {
    High: { amber: 7, red: 21 },
    Medium: { amber: 21, red: 45 },
    Low: { amber: 45, red: 90 },
  }
  const t = ageThresholds[priority] ?? ageThresholds.Medium
  if (age >= t.red) escalate("red")
  else if (age >= t.amber) escalate("amber")

  return worst
}

export async function getActions(): Promise<ActionRow[]> {
  const siteRows = await db.select().from(sites)
  const userRows = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
  const rows = await db.select().from(actions).orderBy(desc(actions.escalated))

  const ragRank: Record<Rag, number> = { red: 0, amber: 1, green: 2 }
  return rows
    .map((a) => {
      const dueDate = a.dueDate ? String(a.dueDate) : null
      const { overdue, daysOverdue } = computeOverdue(dueDate, a.status)
      const ragOverride = a.ragOverride ?? null
      const effectiveRag = computeAutoRag({
        status: a.status,
        priority: a.priority,
        functionArea: a.functionArea,
        dueDate,
        createdAt: a.createdAt,
        ragOverride,
      })
      const ownerName = a.ownerUserId
        ? (userRows.find((u) => u.id === a.ownerUserId)?.name ?? null)
        : null
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        functionArea: a.functionArea,
        siteName: a.siteId
          ? (siteRows.find((s) => s.id === a.siteId)?.name ?? null)
          : null,
        owner: a.owner,
        ownerUserId: a.ownerUserId ?? null,
        ownerName,
        // Always-safe display label: never leaks a raw user id. Resolves the
        // assigned user's name first, then a friendly free-text owner (role or
        // name), and as a last resort resolves an id accidentally stored in the
        // owner text back to a name. Falls back to "Unassigned".
        ownerLabel:
          ownerName ??
          friendlyOwner(a.owner, userRows) ??
          "Unassigned",
        entryType: a.entryType ?? "Action",
        priority: a.priority,
        status: a.status,
        rag: effectiveRag,
        // Whether the colour is a manual pin (true) or auto-calculated (false).
        ragOverridden: ragOverride != null,
        dueDate,
        escalated: a.escalated,
        autoEscalated: a.autoEscalated,
        escalationReason: a.escalationReason ?? null,
        isRisk: a.isRisk,
        overdue,
        daysOverdue,
      }
    })
    .sort((a, b) => {
      if (a.status === "Closed" && b.status !== "Closed") return 1
      if (b.status === "Closed" && a.status !== "Closed") return -1
      // Overdue items float to the top, most-overdue first.
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      if (a.overdue && b.overdue) return b.daysOverdue - a.daysOverdue
      return ragRank[a.rag] - ragRank[b.rag]
    })
}

// ---------------------------------------------------------------------------
// Functional area reporting
// ---------------------------------------------------------------------------

export type FunctionAreaSummary = {
  key: string
  label: string
  description: string
  ownerRole: string
  icon: string
  rag: Rag
  total: number
  open: number
  red: number
  amber: number
  escalated: number
  overdue: number
  risks: number
  // Open RAID counts by entry type, for the area cards.
  issues: number
  actionItems: number
  // The single worst open action title, for an at-a-glance headline.
  topIssue: string | null
  }

/** Roll up the action register into the canonical functional areas. */
export async function getFunctionAreaSummaries(): Promise<FunctionAreaSummary[]> {
  const all = await getActions()
  const ragRank: Record<Rag, number> = { red: 0, amber: 1, green: 2 }

  return FUNCTION_AREAS.map((area) => {
    const items = all.filter(
      (a) => canonicalAreaKey(a.functionArea) === area.key,
    )
    const open = items.filter((a) => a.status !== "Closed")
    const red = open.filter((a) => a.rag === "red")
    const amber = open.filter((a) => a.rag === "amber")
    const escalated = open.filter((a) => a.escalated)
    const overdue = open.filter((a) => a.overdue)
    const risks = open.filter((a) => (a.entryType ?? "Action") === "Risk" || a.isRisk)
    const issues = open.filter((a) => (a.entryType ?? "Action") === "Issue")
    const actionItems = open.filter(
      (a) => (a.entryType ?? "Action") === "Action" && !a.isRisk,
    )

    // Worst-status roll-up across open items; no open items = green.
    const rag: Rag =
      red.length > 0 ? "red" : amber.length > 0 ? "amber" : "green"

    const topIssue =
      [...open].sort((a, b) => ragRank[a.rag] - ragRank[b.rag])[0]?.title ??
      null

    return {
      key: area.key,
      label: area.label,
      description: area.description,
      ownerRole: area.ownerRole,
      icon: area.icon,
      rag,
      total: items.length,
      open: open.length,
      red: red.length,
      amber: amber.length,
      escalated: escalated.length,
      overdue: overdue.length,
      risks: risks.length,
      issues: issues.length,
      actionItems: actionItems.length,
      topIssue,
    }
  })
}

/** All actions belonging to a single functional area (for the detail page). */
export async function getFunctionAreaActions(
  areaKey: string,
): Promise<ActionRow[]> {
  const all = await getActions()
  return all.filter((a) => canonicalAreaKey(a.functionArea) === areaKey)
}

// ---------------------------------------------------------------------------
// Weekly KPI framework — every functional area is scored against its KPIs and
// rolled up (weighted) to a per-area RAG, then to a single overall business
// RAG using the "weighted score band" industry logic.
// ---------------------------------------------------------------------------

export type KpiResult = {
  code: string
  name: string
  unit: string
  value: number | null
  green: number
  amber: number
  direction: "higher_better" | "lower_better"
  weight: number
  rag: Rag
  help: string
  entered: boolean
  // Named accountable owner for this KPI (falls back to the role label).
  owner: string
}

export type AreaScore = {
  key: string
  label: string
  icon: string
  ownerRole: string
  weight: number
  rag: Rag
  pct: number
  source: "operational" | "manual"
  detail: string
  kpis: KpiResult[]
  // Present only for per-brand areas (e.g. Marketing & Social): the KPI grid
  // split out by brand so the UI can show which brand is dragging the area.
  brands?: BrandKpiResults[]
}

export type BusinessScorecard = {
  week: string
  overallRag: Rag
  overallPct: number
  areas: AreaScore[]
}

/** Map KPI code -> kpis.id for joining manual weekly values. */
async function kpiIdByCode(): Promise<Map<string, number>> {
  const rows = await db.select({ id: kpis.id, code: kpis.code }).from(kpis)
  return new Map(rows.map((r) => [r.code, r.id]))
}

/** Manually-entered KPI results (HR, Marketing) for a given week. */
export async function getManualKpiResults(
  areaKey: string,
  week: string,
): Promise<KpiResult[]> {
  const defs = kpisForArea(areaKey)
  if (defs.length === 0) return []

  const idMap = await kpiIdByCode()
  const ids = defs.map((d) => idMap.get(d.code)).filter(Boolean) as number[]

  const rows =
    ids.length > 0
      ? await db
          .select()
          .from(kpiValues)
          .where(
            and(
              eq(kpiValues.period, week),
              inArray(kpiValues.kpiId, ids),
            ),
          )
      : []

  return defs.map((def) => {
    const id = idMap.get(def.code)
    const row = rows.find((r) => r.kpiId === id)
    const entered = !!row
    const value = entered ? Number(row!.value) : null
    const rag: Rag = entered ? scoreKpi(def, value!) : "red"
    return {
      code: def.code,
      name: def.name,
      unit: def.unit,
      value,
      green: def.green,
      amber: def.amber,
      direction: def.direction,
      weight: def.weight,
      rag,
      help: def.help,
      entered,
      owner: def.owner?.trim() || def.ownerRole,
    }
  })
}

export type BrandKpiResults = { brand: string; kpis: KpiResult[] }

/**
 * Per-brand KPI results for an area tracked at brand level (e.g. Marketing &
 * Social). Returns one block per brand; any KPI not entered for that brand is
 * scored red so the area cannot read green unless every brand hits every KPI.
 */
export async function getManualKpiResultsByBrand(
  areaKey: string,
  week: string,
): Promise<BrandKpiResults[]> {
  const defs = kpisForBrand(areaKey)
  if (defs.length === 0) return []

  const idMap = await kpiIdByCode()
  const ids = defs.map((d) => idMap.get(d.code)).filter(Boolean) as number[]

  const rows =
    ids.length > 0
      ? await db
          .select()
          .from(kpiValues)
          .where(
            and(eq(kpiValues.period, week), inArray(kpiValues.kpiId, ids)),
          )
      : []

  return KPI_BRANDS.map((brand) => ({
    brand,
    kpis: defs.map((def) => {
      const id = idMap.get(def.code)
      const row = rows.find((r) => r.kpiId === id && r.brand === brand)
      const entered = !!row
      const value = entered ? Number(row!.value) : null
      const rag: Rag = entered ? scoreKpi(def, value!) : "red"
      return {
        code: def.code,
        name: def.name,
        unit: def.unit,
        value,
        green: def.green,
        amber: def.amber,
        direction: def.direction,
        weight: def.weight,
        rag,
        help: def.help,
        entered,
        owner: def.owner?.trim() || def.ownerRole,
      }
    }),
  }))
}

/**
 * Build the full business scorecard for a week: a RAG + score for every
 * functional area (operational areas derived from live data, HR/Marketing from
 * weekly KPI entry) and the weighted overall business RAG.
 */
export async function getBusinessScorecard(
  week: string,
): Promise<BusinessScorecard> {
  const siteRows = await getSiteWeek(week)
  const revenue = await getGroupRevenueBreakdown(week)
  const shops = siteRows.filter((s) => s.siteType !== "training")
  const academies = siteRows.filter((s) => s.siteType === "training")

  // ---- Operational areas (derived) --------------------------------------
  // Group capacity = total headcount across all shops / total chair capacity.
  // RAG: green at/above capacity, amber within 10% under, red below.
  const groupHeadcount = shops.reduce((a, s) => a + s.activeBarbers, 0)
  const groupChairs = shops.reduce((a, s) => a + s.chairCapacity, 0)
  const capacityRag = ragForUtilisation(groupHeadcount, groupChairs)
  const rtbRag = rollUpRag(shops.map((s) => s.rtbRag))
  const subletRag = ragForSublet(revenue.subletRevenue, revenue.subletTarget)
  const trainingRag = rollUpRag(academies.map((s) => s.trainingRag))

  const capPct = groupChairs > 0 ? Math.round((groupHeadcount / groupChairs) * 100) : 0
  const rtbPct = ragPct(rtbRag)
  const subletPct =
    revenue.subletTarget > 0
      ? Math.round((revenue.subletRevenue / revenue.subletTarget) * 100)
      : ragPct(subletRag)
  const trainingPct = ragPct(trainingRag)

  const opAreas: AreaScore[] = [
    {
      key: "Capacity",
      label: "Capacity & Utilisation",
      icon: "Armchair",
      ownerRole: "Operations",
      weight: AREA_WEIGHTS.Capacity,
      rag: capacityRag,
      pct: capPct,
      source: "operational",
      detail: `${groupHeadcount} headcount across ${groupChairs} chairs (${capPct}%)`,
      kpis: [],
    },
    {
      key: "RTB",
      label: "Revenue To Business",
      icon: "Banknote",
      ownerRole: "Finance",
      weight: AREA_WEIGHTS.RTB,
      rag: rtbRag,
      pct: rtbPct,
      source: "operational",
      detail: `${fmtGBP(shops.reduce((a, s) => a + s.rtbActual, 0))} rent vs ${fmtGBP(shops.reduce((a, s) => a + s.rtbExpected, 0))} expected`,
      kpis: [],
    },
    {
      key: "Subletting",
      label: "Subletting",
      icon: "Building2",
      ownerRole: "Operations",
      weight: AREA_WEIGHTS.Subletting,
      rag: subletRag,
      pct: subletPct,
      source: "operational",
      detail: `${fmtGBP(revenue.subletRevenue)} vs ${fmtGBP(revenue.subletTarget)} target`,
      kpis: [],
    },
    {
      key: "Training",
      label: "Training & Academy",
      icon: "GraduationCap",
      ownerRole: "Training Lead",
      weight: AREA_WEIGHTS.Training,
      rag: trainingRag,
      pct: trainingPct,
      source: "operational",
      detail: `${fmtGBP(revenue.trainingRevenue)} training income`,
      kpis: [],
    },
  ]

  // ---- Manual KPI areas (HR, Marketing) ---------------------------------
  const manualAreas: AreaScore[] = []
  for (const areaKey of ["HR", "Marketing"]) {
    const areaCfg = FUNCTION_AREAS.find((a) => a.key === areaKey)

    if (isPerBrandArea(areaKey)) {
      // Per-brand area: score every brand × KPI cell. Un-entered cells are
      // already red, so the area can only be green when every brand hits every
      // KPI. The roll-up spans all cells across all brands.
      const brands = await getManualKpiResultsByBrand(areaKey, week)
      const allCells = brands.flatMap((b) => b.kpis)
      const enteredCells = allCells.filter((k) => k.entered)
      const roll = rollUpWeighted(
        allCells.map((k) => ({ item: k.rag, weight: k.weight }) as WeightedRag),
      )
      const totalCells = allCells.length
      const brandsReporting = brands.filter((b) =>
        b.kpis.some((k) => k.entered),
      ).length
      manualAreas.push({
        key: areaKey,
        label: areaCfg?.label ?? areaKey,
        icon: areaCfg?.icon ?? "Activity",
        ownerRole: areaCfg?.ownerRole ?? "",
        weight: AREA_WEIGHTS[areaKey] ?? 1,
        rag: enteredCells.length === 0 ? "red" : roll.rag,
        pct: enteredCells.length === 0 ? 0 : roll.pct,
        source: "manual",
        detail: `${brandsReporting}/${KPI_BRANDS.length} brands · ${enteredCells.length}/${totalCells} KPIs reported`,
        kpis: allCells,
        brands,
      })
      continue
    }

    const kpiResults = await getManualKpiResults(areaKey, week)
    // Roll up ALL catalogued KPIs (not just entered ones): a KPI with no entry
    // is already scored red, so the area cannot read green unless every
    // required KPI has actually been entered AND met.
    const roll = rollUpWeighted(
      kpiResults.map((k) => ({ item: k.rag, weight: k.weight }) as WeightedRag),
    )
    const entered = kpiResults.filter((k) => k.entered)
    const allEntered =
      kpiResults.length > 0 && entered.length === kpiResults.length
    manualAreas.push({
      key: areaKey,
      label: areaCfg?.label ?? areaKey,
      icon: areaCfg?.icon ?? "Activity",
      ownerRole: areaCfg?.ownerRole ?? "",
      weight: AREA_WEIGHTS[areaKey] ?? 1,
      // If no data entered yet this week, the area is red (not reported).
      rag: entered.length === 0 ? "red" : roll.rag,
      pct: entered.length === 0 ? 0 : roll.pct,
      source: "manual",
      detail: allEntered
        ? `${entered.length}/${kpiResults.length} KPIs reported`
        : `${entered.length}/${kpiResults.length} KPIs reported — awaiting input`,
      kpis: kpiResults,
    })
  }

  const areas = [...opAreas, ...manualAreas]

  // ---- Actions-scored areas (Strategy) ----------------------------------
  // Areas with no operational feed and no weekly KPI catalogue are scored
  // straight from their open action register: any open red = red, else any
  // open amber = amber, else green. Keeps director-level work (Expansion
  // Strategy) interlocked into the overall business RAG.
  const allActions = await getActions()
  for (const areaKey of ACTIONS_SCORED_AREAS) {
    const areaCfg = FUNCTION_AREAS.find((a) => a.key === areaKey)
    const items = allActions.filter(
      (a) => canonicalAreaKey(a.functionArea) === areaKey,
    )
    const open = items.filter((a) => a.status !== "Closed")
    const red = open.filter((a) => a.rag === "red").length
    const amber = open.filter((a) => a.rag === "amber").length
    const areaRag: Rag = red > 0 ? "red" : amber > 0 ? "amber" : "green"
    const closed = items.length - open.length
    areas.push({
      key: areaKey,
      label: areaCfg?.label ?? areaKey,
      icon: areaCfg?.icon ?? "Activity",
      ownerRole: areaCfg?.ownerRole ?? "",
      weight: AREA_WEIGHTS[areaKey] ?? 1,
      rag: areaRag,
      pct: ragPct(areaRag),
      source: "manual",
      detail:
        items.length === 0
          ? "No strategic items logged"
          : `${closed}/${items.length} milestones complete · ${open.length} open`,
      kpis: [],
    })
  }

  // ---- Overall business RAG (weighted score band) -----------------------
  const overall = rollUpWeighted(
    areas.map((a) => ({ item: a.rag, weight: a.weight }) as WeightedRag),
  )

  return {
    week,
    overallRag: overall.rag,
    overallPct: overall.pct,
    areas,
  }
}

/** Approximate a percentage from a RAG band, for areas scored qualitatively. */
function ragPct(rag: Rag): number {
  return rag === "green" ? 100 : rag === "amber" ? 70 : 35
}

/** Company users who can be assigned as a risk/action owner. */
export type AssignableOwner = { id: string; name: string; email: string }
export async function getAssignableOwners(): Promise<AssignableOwner[]> {
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      canViewDashboard: userTable.canViewDashboard,
    })
    .from(userTable)
    .orderBy(userTable.name)
  return rows
    .filter((u) => u.canViewDashboard)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }))
}

// ---------------------------------------------------------------------------
// Operational meeting register (Cosmin) — every action being undertaken
// ---------------------------------------------------------------------------

export type RiskOwnerGroup = {
  ownerName: string
  ownerUserId: string | null
  risks: ActionRow[]
}

export type RiskRegister = {
  total: number
  open: number
  unassigned: number
  riskCount: number
  groups: RiskOwnerGroup[]
}

/**
 * Every live action (anything not closed) grouped by its assigned owner — the
 * working agenda for Cosmin's weekly operational meeting. Each item is editable
 * (owner, RAG, status, risk flag) and writes back to the shared action
 * register. Unassigned actions are grouped last.
 */
export async function getRiskRegister(): Promise<RiskRegister> {
  const all = await getActions()
  const live = all.filter((a) => a.status !== "Closed")
  const open = live.filter((r) => r.status === "Open").length
  const unassigned = live.filter((r) => !r.ownerUserId).length
  const riskCount = live.filter((r) => r.isRisk).length

  const byOwner = new Map<string, RiskOwnerGroup>()
  for (const r of live) {
    const key = r.ownerUserId ?? "__unassigned__"
    const name = r.ownerUserId ? r.ownerLabel : "Unassigned"
    if (!byOwner.has(key)) {
      byOwner.set(key, {
        ownerName: name,
        ownerUserId: r.ownerUserId,
        risks: [],
      })
    }
    byOwner.get(key)!.risks.push(r)
  }

  const groups = [...byOwner.values()].sort((a, b) => {
    if (!a.ownerUserId) return 1
    if (!b.ownerUserId) return -1
    return a.ownerName.localeCompare(b.ownerName)
  })

  return { total: live.length, open, unassigned, riskCount, groups }
}

// ---------------------------------------------------------------------------
// Data entry helpers
// ---------------------------------------------------------------------------

export type DataEntryBarber = {
  id: number
  name: string
  role: string
  targetWeekly: number
  // The barber's current base site, confirmed weekly on submission.
  siteId: number
  cash: number
  card: number
  cashRent: number
  cardRent: number
  manager: string
  transferCompleted: boolean
  comments: string | null
  reported: boolean
}

export type SiteOption = { id: number; name: string }

export type DataEntrySite = {
  id: number
  name: string
  location: string
  barbers: DataEntryBarber[]
}

/** All active barbers grouped by site, pre-filled with the given week's takings. */
export async function getDataEntrySites(week: string): Promise<DataEntrySite[]> {
  const siteRows = await db.select().from(sites).orderBy(sites.name)
  const barberRows = await db
    .select()
    .from(barbers)
    .where(eq(barbers.active, true))
    .orderBy(asc(barbers.name))
  const takingRows = await db
    .select()
    .from(weeklyTakings)
    .where(eq(weeklyTakings.weekEnding, week))

  return siteRows.map((s) => ({
    id: s.id,
    name: s.name,
    location: s.location,
    barbers: barberRows
      .filter((b) => b.siteId === s.id)
      .map((b) => {
        const t = takingRows.find((r) => r.barberId === b.id)
        return {
          id: b.id,
          name: b.name,
          role: b.role,
          targetWeekly: Number(b.targetWeekly),
          siteId: b.siteId,
          cash: t ? Number(t.cash) : 0,
          card: t ? Number(t.card) : 0,
          cashRent: t ? Number(t.cashRent) : 0,
          cardRent: t ? Number(t.cardRent) : 0,
          manager: t?.manager ?? "",
          transferCompleted: t?.transferCompleted ?? true,
          comments: t?.comments ?? null,
          reported: !!t,
        }
      }),
  }))
}

/** All sites as lightweight options for the weekly location confirmation. */
export async function getSiteOptions(): Promise<SiteOption[]> {
  const rows = await db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .orderBy(sites.name)
  return rows
}

/** Recent week-ending Saturdays for the picker (existing weeks + next upcoming Saturday). */
export async function getEntryWeeks(): Promise<string[]> {
  const existing = await getWeeks()
  const set = new Set(existing)

  // Compute the most recent Saturday (week ending) and the next one.
  const today = new Date()
  const day = today.getUTCDay() // 0 = Sun ... 6 = Sat
  const daysSinceSat = (day + 1) % 7
  const lastSat = new Date(today)
  lastSat.setUTCDate(today.getUTCDate() - daysSinceSat)
  for (let i = 0; i < 3; i++) {
    const d = new Date(lastSat)
    d.setUTCDate(lastSat.getUTCDate() + 7 * i)
    set.add(d.toISOString().slice(0, 10))
  }

  return Array.from(set).sort((a, b) => (a < b ? 1 : -1))
}

// ---------------------------------------------------------------------------
// Subletting KPI (chair/room rent income per site)
// ---------------------------------------------------------------------------

export type SubletWeek = {
  siteId: number
  siteName: string
  week: string
  amount: number
  target: number
  attainmentPct: number
  rag: Rag
  recordedBy: string | null
  notes: string | null
  reported: boolean
}

/** The subletting figure for a single site + week (defaults if none yet). */
export async function getSubletForSiteWeek(
  siteId: number,
  week: string,
): Promise<SubletWeek | null> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
  if (!site) return null

  const [row] = await db
    .select()
    .from(sublettingTakings)
    .where(
      and(
        eq(sublettingTakings.siteId, siteId),
        eq(sublettingTakings.weekEnding, week),
      ),
    )

  const target = row ? Number(row.target) : SUBLET_WEEKLY_TARGET
  const amount = row ? Number(row.amount) : 0
  return {
    siteId,
    siteName: site.name,
    week,
    amount,
    target,
    attainmentPct: target > 0 ? (amount / target) * 100 : 0,
    rag: row ? ragForSublet(amount, target) : "red",
    recordedBy: row?.recordedBy ?? null,
    notes: row?.notes ?? null,
    reported: !!row,
  }
}

/** A site's full subletting history, oldest first. */
export async function getSubletHistory(siteId: number) {
  const rows = await db
    .select()
    .from(sublettingTakings)
    .where(eq(sublettingTakings.siteId, siteId))
    .orderBy(asc(sublettingTakings.weekEnding))
  return rows.map((r) => {
    const amount = Number(r.amount)
    const target = Number(r.target)
    return {
      week: String(r.weekEnding),
      label: fmtWeek(String(r.weekEnding)),
      amount,
      target,
      rag: ragForSublet(amount, target),
    }
  })
}

// ---------------------------------------------------------------------------
// Capacity / utilisation + Revenue-To-Business (£500 per barber) KPIs
// ---------------------------------------------------------------------------

export type CapacityKpis = {
  siteId: number
  siteType: string
  // Chair utilisation
  activeBarbers: number
  rtbBarbers: number
  chairCapacity: number
  utilisationPct: number
  utilisationRag: Rag
  vacantChairs: number
  // Revenue To Business (barbers x £500)
  rtbPerBarber: number
  rtbExpected: number
  rtbActual: number
  rtbAttainmentPct: number
  rtbRag: Rag
  rtbReported: boolean
  // Training (academy sites)
  learnerCapacity: number
  apprenticeCapacity: number
  privateLearners: number
  apprentices: number
  trainingRag: Rag
  trainingReported: boolean
}

/**
 * Capacity-based KPIs for a single site + week:
 *  - chair utilisation (active barbers vs capacity)
 *  - Revenue-To-Business (sum of rent returned vs barbers x £500)
 *  - training throughput (learners/apprentices vs weekly capacity)
 */
export async function getCapacityKpis(
  siteId: number,
  week: string,
): Promise<CapacityKpis | null> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
  if (!site) return null

  const [barberAgg] = await db
    .select({ c: sql<number>`count(*)` })
    .from(barbers)
    .where(and(eq(barbers.siteId, siteId), eq(barbers.active, true)))
  const activeBarbers = Number(barberAgg?.c ?? 0)

  const chairCapacity = site.chairCapacity ?? 0
  // Sites such as F.AF confirm a headcount rather than entering per-barber
  // records, so use the greater of barber rows and confirmed headcount as the
  // number of staffed barbers. Chair utilisation is then capped at the chair
  // capacity — a shop can't be more than 100% utilised even if it carries more
  // barbers than chairs (e.g. LTZ Soresby with 10 barbers across 8 chairs).
  const staffedBarbers = Math.max(activeBarbers, site.headcount ?? 0)
  const staffedChairs = Math.min(staffedBarbers, chairCapacity || staffedBarbers)
  const utilisationPct =
    chairCapacity > 0 ? (staffedChairs / chairCapacity) * 100 : 0

  // RTB actual = rent returned to the business this week (cash + card rent).
  const [rentAgg] = await db
    .select({
      rent: sql<number>`coalesce(sum(${weeklyTakings.cashRent} + ${weeklyTakings.cardRent}), 0)`,
      reporting: sql<number>`count(distinct ${weeklyTakings.barberId})`,
    })
    .from(weeklyTakings)
    .where(
      and(
        eq(weeklyTakings.siteId, siteId),
        eq(weeklyTakings.weekEnding, week),
      ),
    )
  const rtbActual = Number(rentAgg?.rent ?? 0)
  const rtbReported = Number(rentAgg?.reporting ?? 0) > 0
  // RTB per barber per week is a flat board assumption of £500. A site's stored
  // figure overrides it only if explicitly set higher. Expected RTB scales with
  // every barber on the floor (not capped to chairs).
  const rtbPerBarber = Math.max(
    RTB_PER_BARBER_WEEKLY,
    Number(site.rtbPerBarber ?? 0),
  )
  const rtbExpected = staffedBarbers * rtbPerBarber

  // Training throughput for the week (academy sites only).
  const [tw] = await db
    .select()
    .from(trainingWeeks)
    .where(
      and(
        eq(trainingWeeks.siteId, siteId),
        eq(trainingWeeks.weekEnding, week),
      ),
    )
  const privateLearners = tw ? Number(tw.privateLearners) : 0
  const apprentices = tw ? Number(tw.apprentices) : 0

  return {
    siteId,
    siteType: site.siteType ?? "barbershop",
    activeBarbers: staffedChairs,
    rtbBarbers: staffedBarbers,
    chairCapacity,
    utilisationPct,
    utilisationRag: ragForUtilisation(staffedChairs, chairCapacity),
    vacantChairs: Math.max(0, chairCapacity - staffedChairs),
    rtbPerBarber,
    rtbExpected,
    rtbActual,
    rtbAttainmentPct: rtbExpected > 0 ? (rtbActual / rtbExpected) * 100 : 0,
    rtbRag: ragForRtb(rtbActual, rtbExpected),
    rtbReported,
    learnerCapacity: site.learnerCapacity ?? 0,
    apprenticeCapacity: site.apprenticeCapacity ?? 0,
    privateLearners,
    apprentices,
    trainingRag: tw
      ? ragForTraining(
          privateLearners,
          site.learnerCapacity ?? 0,
          apprentices,
          site.apprenticeCapacity ?? 0,
        )
      : "red",
    trainingReported: !!tw,
  }
}

/** Training-academy sites with their KPIs for the given week (for the Weekly
 *  Input page so training can be entered alongside takings). */
export async function getTrainingSitesForWeek(
  week: string,
): Promise<{ id: number; name: string; kpis: CapacityKpis }[]> {
  const rows = await db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .where(eq(sites.siteType, "training"))
    .orderBy(sites.name)

  const out: { id: number; name: string; kpis: CapacityKpis }[] = []
  for (const r of rows) {
    const kpis = await getCapacityKpis(r.id, week)
    if (kpis) out.push({ id: r.id, name: r.name, kpis })
  }
  return out
}

// ---------------------------------------------------------------------------
// Profit-split (barber vs business %) — secure owner-only area
// ---------------------------------------------------------------------------

export type BarberSplitRow = {
  id: number
  name: string
  role: string
  siteId: number
  siteName: string
  barberPct: number | null
  effectiveBarberPct: number
  businessPct: number
  splitSetBy: string | null
  splitSetAt: string | null
  hasData: boolean
  weekTakings: number
  reviewedThisWeek: boolean
}

/**
 * All active barbers with their profit-split %, joined to the given week's
 * takings. `hasData` is true once a barber has loaded takings (so the split
 * can be set); `reviewedThisWeek` is true when the split was confirmed during
 * the current reporting week.
 */
export async function getBarberSplits(week: string): Promise<BarberSplitRow[]> {
  const siteRows = await db.select().from(sites)
  const barberRows = await db
    .select()
    .from(barbers)
    .where(eq(barbers.active, true))
    .orderBy(asc(barbers.name))
  const takingRows = await db
    .select()
    .from(weeklyTakings)
    .where(eq(weeklyTakings.weekEnding, week))

  // Any week of takings means the barber has loaded data at least once.
  const everReported = await db
    .select({ barberId: weeklyTakings.barberId })
    .from(weeklyTakings)
    .groupBy(weeklyTakings.barberId)
  const reportedSet = new Set(everReported.map((r) => r.barberId))

  return barberRows.map((b) => {
    const pct = b.barberPct == null ? null : Number(b.barberPct)
    const eff = effectiveBarberPct(pct)
    const t = takingRows.find((r) => r.barberId === b.id)
    const setAt = b.splitSetAt ? new Date(b.splitSetAt) : null
    return {
      id: b.id,
      name: b.name,
      role: b.role,
      siteId: b.siteId,
      siteName: siteRows.find((s) => s.id === b.siteId)?.name ?? "—",
      barberPct: pct,
      effectiveBarberPct: eff,
      businessPct: 100 - eff,
      splitSetBy: b.splitSetBy ?? null,
      splitSetAt: setAt ? setAt.toISOString() : null,
      hasData: reportedSet.has(b.id),
      weekTakings: t ? Number(t.total) : 0,
      reviewedThisWeek: setAt
        ? setAt >= new Date(`${week}T00:00:00`)
        : false,
    }
  })
}

export type AdminBarber = {
  id: number
  name: string
  role: string
  hasData: boolean
}

export type BarberSiteGroup = {
  siteId: number
  siteName: string
  siteType: string
  barbers: AdminBarber[]
}

/**
 * All active barbers grouped by site, for the Barbers admin tab. `hasData`
 * flags whether the barber has ever loaded takings (so an accidental removal of
 * someone with history is clearly signposted).
 */
export async function getActiveBarbersBySite(): Promise<BarberSiteGroup[]> {
  const siteRows = await db.select().from(sites).orderBy(asc(sites.name))
  const barberRows = await db
    .select()
    .from(barbers)
    .where(eq(barbers.active, true))
    .orderBy(asc(barbers.name))
  const everReported = await db
    .select({ barberId: weeklyTakings.barberId })
    .from(weeklyTakings)
    .groupBy(weeklyTakings.barberId)
  const reportedSet = new Set(everReported.map((r) => r.barberId))

  return siteRows.map((s) => ({
    siteId: s.id,
    siteName: s.name,
    siteType: s.siteType,
    barbers: barberRows
      .filter((b) => b.siteId === s.id)
      .map((b) => ({
        id: b.id,
        name: b.name,
        role: b.role,
        hasData: reportedSet.has(b.id),
      })),
  }))
}
