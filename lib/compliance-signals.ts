import "server-only"
import { db } from "@/lib/db"
import {
  actions,
  barbers,
  sites,
  siteConfirmations,
  weeklyTakings,
} from "@/lib/db/schema"
import { and, eq, gte, inArray } from "drizzle-orm"
import { computeAutoRag } from "@/lib/data"
import { fmtWeek, isPastSubmissionDeadline } from "@/lib/format"
import { getAccountabilityMisses } from "@/lib/accountability"

// How far back the compliance signals look. The monthly 1-2-1 cadence means a
// quarter of history gives useful context without drowning the review.
const LOOKBACK_WEEKS = 12
// Someone carrying more than this many open red RAID items is flagged.
const RED_RAID_THRESHOLD = 5

export type ComplianceSummary = {
  /** Short, human-facing bullet lines for the read-only UI card. */
  flags: string[]
  lateConfirmations: number
  missedConfirmations: number
  redRaid: number
  staleRaid: number
  overdueTasks: number
  /** Accountability items missed after their single reminder (unresolved). */
  accountabilityMisses: number
  /** True when nothing of concern was found. */
  clean: boolean
}

export type ComplianceSignals = ComplianceSummary & {
  /** Whether we could attribute RAID to this person (needs a linked login). */
  raidAttributable: boolean
  /** The compiled evidence block passed to the AI PBC analysis. */
  aiText: string
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}

/**
 * Which site ids this person is responsible for confirming: their own barber
 * site plus any site whose declared manager_name matches their name. Mirrors
 * lib/access.getManagedSiteIds but keyed off the barber record so it can run
 * without an AccessUser.
 */
async function managedSiteIds(
  ownSiteId: number,
  name: string,
): Promise<number[]> {
  const ids = new Set<number>([ownSiteId])
  const allSites = await db
    .select({ id: sites.id, managerName: sites.managerName })
    .from(sites)
  const full = name.toLowerCase().trim()
  const first = full.split(/\s+/)[0] ?? full
  for (const s of allSites) {
    const mn = (s.managerName ?? "").toLowerCase()
    if (!mn) continue
    const tokens = mn
      .split(/[/,&]|\band\b/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (tokens.some((t) => full.includes(t) || (first && t.includes(first))))
      ids.add(s.id)
  }
  return Array.from(ids)
}

/**
 * Compile a barber's operational-compliance signals over the last 12 weeks so
 * they can be fed into the AI PBC analysis BEFORE the manager starts the 1-2-1.
 * Signals: late/missed weekly confirmations, carrying more than 5 open red RAID
 * items, stale RAID (open+red 2+ weeks or overdue 7+ days) and overdue tasks.
 * Read-only: computes on demand, writes nothing.
 */
export async function getComplianceSignals(
  barberId: number,
): Promise<ComplianceSignals> {
  const [b] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  if (!b) {
    return {
      flags: [],
      lateConfirmations: 0,
      missedConfirmations: 0,
      redRaid: 0,
      staleRaid: 0,
      overdueTasks: 0,
      accountabilityMisses: 0,
      clean: true,
      raidAttributable: false,
      aiText: "(no operational record found)",
    }
  }

  const now = new Date()
  const cutoff = isoDaysAgo(LOOKBACK_WEEKS * 7)
  const sevenDaysAgo = isoDaysAgo(7)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000)
  const today = now.toISOString().slice(0, 10)

  // --- 1 & (late/missed) weekly confirmations -----------------------------
  const siteIds = await managedSiteIds(b.siteId, b.name)
  const lateWeeks: string[] = []
  const missedWeeks: string[] = []

  // Weeks (in lookback) where these sites had takings entered.
  const takingWeeks = await db
    .selectDistinct({ weekEnding: weeklyTakings.weekEnding })
    .from(weeklyTakings)
    .where(
      and(
        inArray(weeklyTakings.siteId, siteIds),
        gte(weeklyTakings.weekEnding, cutoff),
      ),
    )
  const confirmRows = await db
    .select()
    .from(siteConfirmations)
    .where(
      and(
        inArray(siteConfirmations.siteId, siteIds),
        gte(siteConfirmations.weekEnding, cutoff),
      ),
    )
  for (const tw of takingWeeks) {
    const week = String(tw.weekEnding)
    // Ignore the current in-progress week (its deadline hasn't passed yet).
    if (!isPastSubmissionDeadline(week, now)) continue
    const conf = confirmRows.find(
      (c) => String(c.weekEnding) === week && c.confirmed,
    )
    if (!conf) {
      missedWeeks.push(week)
    } else if (
      conf.confirmedAt &&
      isPastSubmissionDeadline(week, conf.confirmedAt)
    ) {
      // Confirmed, but the tick landed after that week's Saturday 18:00 deadline.
      lateWeeks.push(week)
    }
  }

  // --- 2, 3 & 4 RAID signals (need a linked login to attribute ownership) --
  const raidAttributable = Boolean(b.userId)
  let redRaid = 0
  let staleRaid = 0
  let overdueTasks = 0
  const staleExamples: string[] = []
  const overdueExamples: string[] = []

  if (raidAttributable) {
    const open = await db
      .select()
      .from(actions)
      .where(
        and(eq(actions.ownerUserId, b.userId as string), eq(actions.status, "Open")),
      )
    for (const a of open) {
      const effectiveRag = computeAutoRag({
        status: a.status,
        priority: a.priority,
        functionArea: a.functionArea,
        dueDate: a.dueDate ? String(a.dueDate) : null,
        createdAt: a.createdAt,
        ragOverride: a.ragOverride,
        now,
      })
      if (effectiveRag === "red") redRaid++

      const overdue = a.dueDate && String(a.dueDate) < today
      const stale =
        (a.dueDate && String(a.dueDate) <= sevenDaysAgo) ||
        (effectiveRag === "red" && a.createdAt && a.createdAt <= fourteenDaysAgo)
      if (stale) {
        staleRaid++
        if (staleExamples.length < 3) staleExamples.push(a.title)
      }
      if (a.entryType === "Action" && overdue) {
        overdueTasks++
        if (overdueExamples.length < 3) overdueExamples.push(a.title)
      }
    }
  }

  // --- 5. Missed accountability items (single-reminder-then-log) ----------
  // Overdue 1-2-1s etc. that were reminded once and still not done. Only count
  // those still unresolved (a late completion clears them).
  const misses = await getAccountabilityMisses(barberId, cutoff)
  const openMisses = misses.filter((m) => !m.resolvedAt)
  const accountabilityMisses = openMisses.length
  const missExamples = openMisses.slice(0, 3).map((m) => m.detail || m.kind)

  // --- Build human flags + AI evidence block ------------------------------
  const flags: string[] = []
  const aiLines: string[] = []

  if (missedWeeks.length) {
    flags.push(
      `${missedWeeks.length} week${missedWeeks.length === 1 ? "" : "s"} with figures entered but never signed off (${missedWeeks.map(fmtWeek).join(", ")})`,
    )
    aiLines.push(
      `Weekly site confirmation MISSED for ${missedWeeks.length} week(s): ${missedWeeks.map(fmtWeek).join(", ")} (figures were entered but the required manager sign-off was never done).`,
    )
  }
  if (lateWeeks.length) {
    flags.push(
      `${lateWeeks.length} weekly confirmation${lateWeeks.length === 1 ? "" : "s"} signed off late (${lateWeeks.map(fmtWeek).join(", ")})`,
    )
    aiLines.push(
      `Weekly site confirmation completed LATE (after the Saturday 18:00 deadline) for ${lateWeeks.length} week(s): ${lateWeeks.map(fmtWeek).join(", ")}.`,
    )
  }
  if (redRaid > RED_RAID_THRESHOLD) {
    flags.push(`${redRaid} open red RAID items — over the ${RED_RAID_THRESHOLD} threshold`)
    aiLines.push(
      `Carrying ${redRaid} open RED RAID items, which is over the acceptable threshold of ${RED_RAID_THRESHOLD} — indicates risks/issues not being brought under control.`,
    )
  } else if (redRaid > 0) {
    flags.push(`${redRaid} open red RAID item${redRaid === 1 ? "" : "s"}`)
    aiLines.push(`Has ${redRaid} open red RAID item(s) (within the ${RED_RAID_THRESHOLD} threshold).`)
  }
  if (staleRaid > 0) {
    flags.push(
      `${staleRaid} stale RAID item${staleRaid === 1 ? "" : "s"} (not updated / overdue)${staleExamples.length ? `: ${staleExamples.join("; ")}` : ""}`,
    )
    aiLines.push(
      `${staleRaid} RAID item(s) are stale (open+red for 2+ weeks or overdue by 7+ days) — not being updated in a timely way${staleExamples.length ? `: ${staleExamples.join("; ")}` : ""}.`,
    )
  }
  if (overdueTasks > 0) {
    flags.push(
      `${overdueTasks} required task${overdueTasks === 1 ? "" : "s"} past due and not completed${overdueExamples.length ? `: ${overdueExamples.join("; ")}` : ""}`,
    )
    aiLines.push(
      `${overdueTasks} required task(s)/action(s) are past their due date and not marked done${overdueExamples.length ? `: ${overdueExamples.join("; ")}` : ""}.`,
    )
  }

  if (accountabilityMisses > 0) {
    flags.push(
      `${accountabilityMisses} accountability item${accountabilityMisses === 1 ? "" : "s"} missed after a reminder${missExamples.length ? `: ${missExamples.join("; ")}` : ""}`,
    )
    aiLines.push(
      `${accountabilityMisses} personal accountability item(s) (e.g. 1-2-1s) were reminded ONCE and still not completed by the deadline${missExamples.length ? `: ${missExamples.join("; ")}` : ""} — a pattern of not acting on the single reminder.`,
    )
  }

  const clean = flags.length === 0
  const aiText = clean
    ? "No operational-compliance concerns in the last 12 weeks: weekly confirmations done on time, no excess or stale red RAID, no overdue required tasks, and no missed accountability items."
    : `Operational-compliance signals from the app over the last 12 weeks (system-recorded facts, not opinion):\n- ${aiLines.join("\n- ")}`

  return {
    flags,
    lateConfirmations: lateWeeks.length,
    missedConfirmations: missedWeeks.length,
    redRaid,
    staleRaid,
    overdueTasks,
    accountabilityMisses,
    clean,
    raidAttributable,
    aiText,
  }
}
