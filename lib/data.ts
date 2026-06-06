import "server-only"
import { db } from "@/lib/db"
import {
  sites,
  barbers,
  weeklyTakings,
  siteConfirmations,
  actions,
} from "@/lib/db/schema"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import {
  type Rag,
  rollUpRag,
  ragFromAttainment,
  fmtGBP,
  fmtWeek,
  fmtWeekLong,
} from "@/lib/format"

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
  siteCount: number
  confirmedSites: number
  avgPerBarber: number
  openActions: number
  escalatedActions: number
  ragCounts: Record<Rag, number>
}

async function weekRevenueFor(week: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${weeklyTakings.total}), 0)` })
    .from(weeklyTakings)
    .where(eq(weeklyTakings.weekEnding, week))
  return Number(row?.total ?? 0)
}

export async function getGroupSummary(week: string): Promise<GroupSummary> {
  const weeks = await getWeeks()
  const prevWeek = prevWeekOf(weeks, week)

  const siteRows = await getSiteWeek(week)
  const weekRevenue = siteRows.reduce((a, s) => a + s.weekRevenue, 0)
  const weekTarget = siteRows.reduce((a, s) => a + s.weekTarget, 0)
  const prevWeekRevenue = prevWeek ? await weekRevenueFor(prevWeek) : 0
  const reportingBarbers = siteRows.reduce((a, s) => a + s.reportingBarbers, 0)

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
    siteCount: siteRows.length,
    confirmedSites,
    avgPerBarber: reportingBarbers > 0 ? weekRevenue / reportingBarbers : 0,
    openActions: Number(actionAgg?.open ?? 0),
    escalatedActions: Number(actionAgg?.escalated ?? 0),
    ragCounts,
  }
}

// ---------------------------------------------------------------------------
// Site-level weekly performance
// ---------------------------------------------------------------------------

export type SiteWeekRow = {
  id: number
  name: string
  location: string
  region: string | null
  managerName: string | null
  weekTarget: number
  weekRevenue: number
  attainmentPct: number
  rag: Rag
  reportingBarbers: number
  totalBarbers: number
  confirmed: boolean
  confirmedBy: string | null
}

export async function getSiteWeek(week: string): Promise<SiteWeekRow[]> {
  const siteRows = await db.select().from(sites).orderBy(sites.name)

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
      reporting: sql<number>`count(distinct ${weeklyTakings.barberId})`,
    })
    .from(weeklyTakings)
    .where(eq(weeklyTakings.weekEnding, week))
    .groupBy(weeklyTakings.siteId)

  const confirmRows = await db
    .select()
    .from(siteConfirmations)
    .where(eq(siteConfirmations.weekEnding, week))

  return siteRows.map((s) => {
    const t = targetAgg.find((r) => r.siteId === s.id)
    const rev = revAgg.find((r) => r.siteId === s.id)
    const conf = confirmRows.find((c) => c.siteId === s.id)
    const weekTarget = Number(t?.target ?? 0)
    const weekRevenue = Number(rev?.revenue ?? 0)
    const attainmentPct = weekTarget > 0 ? (weekRevenue / weekTarget) * 100 : 0
    return {
      id: s.id,
      name: s.name,
      location: s.location,
      region: s.region,
      managerName: s.managerName,
      weekTarget,
      weekRevenue,
      attainmentPct,
      rag: weekRevenue === 0 ? "red" : ragFromAttainment(attainmentPct),
      reportingBarbers: Number(rev?.reporting ?? 0),
      totalBarbers: Number(t?.total ?? 0),
      confirmed: conf?.confirmed ?? false,
      confirmedBy: conf?.confirmedBy ?? null,
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
  const rows = await db
    .select({
      week: weeklyTakings.weekEnding,
      revenue: sql<number>`coalesce(sum(${weeklyTakings.total}), 0)`,
    })
    .from(weeklyTakings)
    .groupBy(weeklyTakings.weekEnding)
    .orderBy(asc(weeklyTakings.weekEnding))

  const [target] = await db
    .select({ t: sql<number>`coalesce(sum(${barbers.targetWeekly}), 0)` })
    .from(barbers)
    .where(eq(barbers.active, true))
  const weekTarget = Number(target?.t ?? 0)

  return rows.map((r) => ({
    week: String(r.week),
    label: fmtWeek(String(r.week)),
    revenue: Math.round(Number(r.revenue)),
    target: weekTarget,
  }))
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

  return barberRows
    .map((b) => {
      const t = takingRows.find((r) => r.barberId === b.id)
      const p = prevRows.find((r) => r.barberId === b.id)
      const revenue = t ? Number(t.total) : 0
      const target = Number(b.targetWeekly)
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
  priority: string
  status: string
  rag: Rag
  dueDate: string | null
  escalated: boolean
}

export async function getActions(): Promise<ActionRow[]> {
  const siteRows = await db.select().from(sites)
  const rows = await db.select().from(actions).orderBy(desc(actions.escalated))

  const ragRank: Record<Rag, number> = { red: 0, amber: 1, green: 2 }
  return rows
    .map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      functionArea: a.functionArea,
      siteName: a.siteId
        ? (siteRows.find((s) => s.id === a.siteId)?.name ?? null)
        : null,
      owner: a.owner,
      priority: a.priority,
      status: a.status,
      rag: a.rag as Rag,
      dueDate: a.dueDate ? String(a.dueDate) : null,
      escalated: a.escalated,
    }))
    .sort((a, b) => {
      if (a.status === "Closed" && b.status !== "Closed") return 1
      if (b.status === "Closed" && a.status !== "Closed") return -1
      return ragRank[a.rag] - ragRank[b.rag]
    })
}
