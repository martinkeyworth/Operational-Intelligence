import "server-only"
import { db } from "@/lib/db"
import {
  barbers,
  sites,
  weeklyTakings,
  leaveRequests,
  oneToOnes,
  threeSixtyCycles,
  threeSixtyNominees,
  user as userTable,
} from "@/lib/db/schema"
import { and, asc, desc, eq } from "drizzle-orm"
import type { Rag } from "@/lib/format"
import { RTB_PER_BARBER } from "@/lib/capacity-config"
import { currentWeekEnding } from "@/lib/reporting"

// ---------------------------------------------------------------------------
// TEAM AREA  —  self-service HR + performance hub for barbers & apprentices.
// ---------------------------------------------------------------------------

/** Weekly RTB target every barber is measured against (£). */
export const RTB_TARGET = RTB_PER_BARBER

// --- RAG rules -------------------------------------------------------------

/** Sickness: 0-4 days green, 5 amber, 6+ red (rolling leave year). */
export function ragForSickness(days: number): Rag {
  if (days >= 6) return "red"
  if (days >= 5) return "amber"
  return "green"
}

/** Holiday: counts DOWN from the 28-day allowance. Plenty left = green,
 *  running low = amber, none left (or over) = red. */
export function ragForHoliday(remaining: number, allowance: number): Rag {
  if (remaining <= 0) return "red"
  if (allowance > 0 && remaining <= allowance * 0.15) return "amber"
  return "green"
}

/** A single takings figure vs the £500 weekly RTB target. */
export function ragForWeekTakings(total: number): Rag {
  return total >= RTB_TARGET ? "green" : total >= RTB_TARGET * 0.9 ? "amber" : "red"
}

// --- Leave-year helper -----------------------------------------------------

export function currentLeaveYear(now = new Date()): number {
  return now.getFullYear()
}

// --- Barber <-> login linking ----------------------------------------------

/** Resolve the operational barber record for a logged-in user, if linked. */
export async function getBarberForUser(userId: string) {
  const [row] = await db.select().from(barbers).where(eq(barbers.userId, userId))
  return row ?? null
}

/** Link / unlink a barber record to a login account (admin action). */
export async function linkBarberToUser(barberId: number, userId: string | null) {
  await db.update(barbers).set({ userId }).where(eq(barbers.id, barberId))
}

/** Set a barber's assigned manager (runs their monthly 1-2-1). */
export async function setBarberManager(barberId: number, managerUserId: string | null) {
  await db.update(barbers).set({ managerUserId }).where(eq(barbers.id, barberId))
}

// --- Types -----------------------------------------------------------------

export type TakingsPoint = {
  weekEnding: string
  actual: number
  target: number
}

export type SelfView = {
  barber: {
    id: number
    name: string
    role: string
    siteName: string
    isApprentice: boolean
    startDate: string | null
  }
  submission: { weekEnding: string; submitted: boolean; total: number }
  takings: TakingsPoint[]
  holiday: { allowance: number; taken: number; remaining: number; rag: Rag }
  sickness: { days: number; rag: Rag }
  nextOneToOne: { id: number; scheduledFor: Date; status: string } | null
  openCycle: {
    id: number
    period: string
    dueOn: string
    nominees: { id: number; name: string; email: string; status: string }[]
  } | null
  apprentice: ApprenticeStatus | null
}

export type ApprenticeStatus = {
  monthsIn: number
  gateDue: string // ISO date of the 3-month gate
  daysToGate: number
  pastGate: boolean
  rag: Rag
}

// --- Apprentice 3-month gate ------------------------------------------------

/** Apprentice gate: must be cutting + earning revenue by 3 months from start.
 *  We proxy "earning revenue" with any weekly takings recorded. */
export function apprenticeStatus(
  startDate: string | null,
  hasRevenue: boolean,
  now = new Date(),
): ApprenticeStatus | null {
  if (!startDate) return null
  const start = new Date(startDate + "T00:00:00")
  const gate = new Date(start)
  gate.setMonth(gate.getMonth() + 3)
  const msMonth = 1000 * 60 * 60 * 24 * 30.4375
  const monthsIn = Math.max(0, (now.getTime() - start.getTime()) / msMonth)
  const daysToGate = Math.ceil((gate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const pastGate = now >= gate
  // Green once earning; red if past the gate without revenue; amber while
  // still within the window and not yet earning.
  const rag: Rag = hasRevenue ? "green" : pastGate ? "red" : "amber"
  return {
    monthsIn: Math.round(monthsIn * 10) / 10,
    gateDue: gate.toISOString().slice(0, 10),
    daysToGate,
    pastGate,
    rag,
  }
}

// --- Self-service view ------------------------------------------------------

/** Everything a logged-in barber sees on their Team Area home. */
export async function getBarberSelfView(barberId: number): Promise<SelfView | null> {
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  if (!barber) return null

  const [site] = await db.select().from(sites).where(eq(sites.id, barber.siteId))
  const week = currentWeekEnding()
  const leaveYear = currentLeaveYear()

  // Last ~12 weeks of this barber's takings, oldest -> newest.
  const takingsRows = await db
    .select()
    .from(weeklyTakings)
    .where(eq(weeklyTakings.barberId, barberId))
    .orderBy(desc(weeklyTakings.weekEnding))
    .limit(12)
  const takings: TakingsPoint[] = takingsRows
    .slice()
    .reverse()
    .map((r) => ({
      weekEnding: r.weekEnding,
      actual: Number(r.total),
      target: RTB_TARGET,
    }))

  const thisWeekRow = takingsRows.find((r) => r.weekEnding === week)
  const submission = {
    weekEnding: week,
    submitted: Boolean(thisWeekRow),
    total: thisWeekRow ? Number(thisWeekRow.total) : 0,
  }

  // Holiday + sickness for the current leave year.
  const leaveRows = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.barberId, barberId), eq(leaveRequests.leaveYear, leaveYear)))
  const holidayTaken = leaveRows
    .filter((r) => r.kind === "holiday" && r.status !== "Declined")
    .reduce((s, r) => s + r.days, 0)
  const sicknessDays = leaveRows
    .filter((r) => r.kind === "sickness")
    .reduce((s, r) => s + r.days, 0)
  const remaining = barber.holidayAllowance - holidayTaken

  // Next 1-2-1 (upcoming or most recent scheduled).
  const [next] = await db
    .select()
    .from(oneToOnes)
    .where(eq(oneToOnes.barberId, barberId))
    .orderBy(desc(oneToOnes.scheduledFor))
    .limit(1)

  // Open 360 cycle + nominees.
  const [cycle] = await db
    .select()
    .from(threeSixtyCycles)
    .where(and(eq(threeSixtyCycles.barberId, barberId), eq(threeSixtyCycles.status, "Open")))
    .orderBy(desc(threeSixtyCycles.openedOn))
    .limit(1)
  let openCycle: SelfView["openCycle"] = null
  if (cycle) {
    const nominees = await db
      .select()
      .from(threeSixtyNominees)
      .where(eq(threeSixtyNominees.cycleId, cycle.id))
      .orderBy(asc(threeSixtyNominees.id))
    openCycle = {
      id: cycle.id,
      period: cycle.period,
      dueOn: cycle.dueOn,
      nominees: nominees.map((n) => ({
        id: n.id,
        name: n.name,
        email: n.email,
        status: n.status,
      })),
    }
  }

  return {
    barber: {
      id: barber.id,
      name: barber.name,
      role: barber.role,
      siteName: site?.name ?? "—",
      isApprentice: barber.isApprentice,
      startDate: barber.startDate,
    },
    submission,
    takings,
    holiday: {
      allowance: barber.holidayAllowance,
      taken: holidayTaken,
      remaining,
      rag: ragForHoliday(remaining, barber.holidayAllowance),
    },
    sickness: { days: sicknessDays, rag: ragForSickness(sicknessDays) },
    nextOneToOne: next
      ? { id: next.id, scheduledFor: next.scheduledFor, status: next.status }
      : null,
    openCycle,
    apprentice: barber.isApprentice
      ? apprenticeStatus(barber.startDate, takingsRows.length > 0)
      : null,
  }
}

// --- Leadership roster ------------------------------------------------------

export type TeamRosterMember = {
  id: number
  name: string
  role: string
  siteId: number
  siteName: string
  isApprentice: boolean
  linked: boolean
  managerName: string | null
  holidayRemaining: number
  holidayRag: Rag
  sicknessDays: number
  sicknessRag: Rag
  oneToOneStatus: "Scheduled" | "Completed" | "Missed" | "None"
  threeSixtyOpen: boolean
  apprenticeRag: Rag | null
}

/** Full team roster for the leadership Team Area, grouped per member with
 *  their HR + cadence status rolled up for the current leave year. */
export async function getTeamRoster(): Promise<TeamRosterMember[]> {
  const barberRows = await db
    .select()
    .from(barbers)
    .where(eq(barbers.active, true))
    .orderBy(asc(barbers.name))
  const siteRows = await db.select().from(sites)
  const userRows = await db.select().from(userTable)
  const leaveYear = currentLeaveYear()

  const siteName = (id: number) => siteRows.find((s) => s.id === id)?.name ?? "—"
  const userName = (id: string | null) =>
    id ? (userRows.find((u) => u.id === id)?.name ?? null) : null

  const out: TeamRosterMember[] = []
  for (const b of barberRows) {
    const leaveRows = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.barberId, b.id), eq(leaveRequests.leaveYear, leaveYear)))
    const holidayTaken = leaveRows
      .filter((r) => r.kind === "holiday" && r.status !== "Declined")
      .reduce((s, r) => s + r.days, 0)
    const sicknessDays = leaveRows
      .filter((r) => r.kind === "sickness")
      .reduce((s, r) => s + r.days, 0)
    const remaining = b.holidayAllowance - holidayTaken

    const [next] = await db
      .select()
      .from(oneToOnes)
      .where(eq(oneToOnes.barberId, b.id))
      .orderBy(desc(oneToOnes.scheduledFor))
      .limit(1)
    const [openCyc] = await db
      .select()
      .from(threeSixtyCycles)
      .where(and(eq(threeSixtyCycles.barberId, b.id), eq(threeSixtyCycles.status, "Open")))
      .limit(1)
    const everReported = await db
      .select({ id: weeklyTakings.id })
      .from(weeklyTakings)
      .where(eq(weeklyTakings.barberId, b.id))
      .limit(1)

    out.push({
      id: b.id,
      name: b.name,
      role: b.role,
      siteId: b.siteId,
      siteName: siteName(b.siteId),
      isApprentice: b.isApprentice,
      linked: Boolean(b.userId),
      managerName: userName(b.managerUserId),
      holidayRemaining: remaining,
      holidayRag: ragForHoliday(remaining, b.holidayAllowance),
      sicknessDays,
      sicknessRag: ragForSickness(sicknessDays),
      oneToOneStatus: (next?.status as TeamRosterMember["oneToOneStatus"]) ?? "None",
      threeSixtyOpen: Boolean(openCyc),
      apprenticeRag: b.isApprentice
        ? (apprenticeStatus(b.startDate, everReported.length > 0)?.rag ?? null)
        : null,
    })
  }
  return out
}

export type TeamKpi = {
  code: string
  label: string
  value: string
  rag: Rag
  help: string
}

/** Headline Team Area KPIs, computed from the live roster. Surfaced as cards
 *  atop the leadership Team Area. */
export async function getTeamKpis(): Promise<TeamKpi[]> {
  const roster = await getTeamRoster()
  const count = roster.length || 1

  const sickGreen = roster.filter((m) => m.sicknessRag === "green").length
  const sickPct = Math.round((sickGreen / count) * 100)

  const oneToOneOk = roster.filter(
    (m) => m.oneToOneStatus === "Scheduled" || m.oneToOneStatus === "Completed",
  ).length
  const oneToOnePct = Math.round((oneToOneOk / count) * 100)

  const threeSixtyEngaged = roster.filter((m) => m.threeSixtyOpen).length

  const apprentices = roster.filter((m) => m.isApprentice)
  const apprenticeRed = apprentices.filter((m) => m.apprenticeRag === "red").length

  const pctRag = (pct: number): Rag => (pct >= 85 ? "green" : pct >= 60 ? "amber" : "red")

  return [
    {
      code: "team_sickness",
      label: "Sickness in range",
      value: `${sickPct}%`,
      rag: pctRag(sickPct),
      help: "Share of the team under the 5-day sickness threshold this leave year (0-4 green, 5 amber, 6+ red).",
    },
    {
      code: "team_one_to_one",
      label: "1-2-1s on track",
      value: `${oneToOnePct}%`,
      rag: pctRag(oneToOnePct),
      help: "Share of team members with a current monthly 1-2-1 scheduled or completed.",
    },
    {
      code: "team_360",
      label: "360s in progress",
      value: `${threeSixtyEngaged}/${roster.length}`,
      rag: "green",
      help: "Team members with an open 360 review cycle (auto-opened every 6 months; 5 nominees each).",
    },
    {
      code: "team_apprentice",
      label: "Apprentices at risk",
      value: `${apprenticeRed}/${apprentices.length}`,
      rag: apprenticeRed === 0 ? "green" : apprenticeRed === 1 ? "amber" : "red",
      help: "Apprentices failing the 3-month cutting + revenue gate, flagged for a keep/separate decision.",
    },
  ]
}

/** Detail for one member, for the leadership member page. */
export async function getTeamMemberDetail(barberId: number) {
  const self = await getBarberSelfView(barberId)
  if (!self) return null
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  const recentLeave = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.barberId, barberId))
    .orderBy(desc(leaveRequests.startDate))
    .limit(20)
  const oneToOneHistory = await db
    .select()
    .from(oneToOnes)
    .where(eq(oneToOnes.barberId, barberId))
    .orderBy(desc(oneToOnes.scheduledFor))
    .limit(12)
  return {
    self,
    managerUserId: barber?.managerUserId ?? null,
    userId: barber?.userId ?? null,
    holidayAllowance: barber?.holidayAllowance ?? 28,
    recentLeave,
    oneToOneHistory,
  }
}
