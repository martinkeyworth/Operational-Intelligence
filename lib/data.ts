import "server-only"
import { db } from "@/lib/db"
import {
  sites,
  barbers,
  revenueEntries,
  kpis,
  kpiValues,
  actions,
} from "@/lib/db/schema"
import { and, desc, eq, gte, sql } from "drizzle-orm"

export type Rag = "green" | "amber" | "red"

const RAG_ORDER: Record<Rag, number> = { red: 0, amber: 1, green: 2 }

/** Worst (most severe) RAG wins when rolling up. */
export function rollUpRag(values: Rag[]): Rag {
  if (values.length === 0) return "green"
  return values.reduce((worst, v) =>
    RAG_ORDER[v] < RAG_ORDER[worst] ? v : worst,
  )
}

/** Compute a RAG given a value, thresholds and direction. */
export function computeRag(
  value: number,
  green: number | null,
  amber: number | null,
  direction: string,
): Rag {
  if (green === null || amber === null) return "green"
  if (direction === "lower_better") {
    if (value <= green) return "green"
    if (value <= amber) return "amber"
    return "red"
  }
  if (value >= green) return "green"
  if (value >= amber) return "amber"
  return "red"
}

export type SiteRow = {
  id: number
  name: string
  location: string
  region: string | null
  managerName: string | null
  monthlyTarget: number
  rag: Rag
  monthRevenue: number
  attainmentPct: number
  activeBarbers: number
  avgRevPerDay: number
}

export async function getSites(): Promise<SiteRow[]> {
  const monthStart = new Date()
  monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().slice(0, 10)

  const siteRows = await db.select().from(sites).orderBy(sites.name)

  const revAgg = await db
    .select({
      siteId: revenueEntries.siteId,
      total: sql<number>`coalesce(sum(${revenueEntries.revenue}), 0)`,
      days: sql<number>`count(distinct ${revenueEntries.entryDate})`,
      entries: sql<number>`count(*)`,
    })
    .from(revenueEntries)
    .where(gte(revenueEntries.entryDate, monthStartStr))
    .groupBy(revenueEntries.siteId)

  const barberAgg = await db
    .select({
      siteId: barbers.siteId,
      count: sql<number>`count(*)`,
    })
    .from(barbers)
    .where(eq(barbers.active, true))
    .groupBy(barbers.siteId)

  return siteRows.map((s) => {
    const rev = revAgg.find((r) => r.siteId === s.id)
    const barberCount = Number(
      barberAgg.find((b) => b.siteId === s.id)?.count ?? 0,
    )
    const monthRevenue = Number(rev?.total ?? 0)
    const days = Number(rev?.days ?? 0)
    const entries = Number(rev?.entries ?? 0)
    const target = Number(s.monthlyTarget)
    const attainmentPct = target > 0 ? (monthRevenue / target) * 100 : 0
    const avgRevPerDay = entries > 0 ? monthRevenue / entries : 0
    return {
      id: s.id,
      name: s.name,
      location: s.location,
      region: s.region,
      managerName: s.managerName,
      monthlyTarget: target,
      rag: s.rag as Rag,
      monthRevenue,
      attainmentPct,
      activeBarbers: barberCount,
      avgRevPerDay,
    }
  })
}

export type GroupSummary = {
  groupRag: Rag
  monthRevenue: number
  monthTarget: number
  attainmentPct: number
  activeBarbers: number
  siteCount: number
  avgRevPerBarberDay: number
  openActions: number
  escalatedActions: number
  ragCounts: Record<Rag, number>
}

export async function getGroupSummary(): Promise<GroupSummary> {
  const siteRows = await getSites()
  const monthStart = new Date()
  monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().slice(0, 10)

  const monthRevenue = siteRows.reduce((a, s) => a + s.monthRevenue, 0)
  const monthTarget = siteRows.reduce((a, s) => a + s.monthlyTarget, 0)
  const activeBarbers = siteRows.reduce((a, s) => a + s.activeBarbers, 0)

  const [revTotals] = await db
    .select({
      total: sql<number>`coalesce(sum(${revenueEntries.revenue}), 0)`,
      entries: sql<number>`count(*)`,
    })
    .from(revenueEntries)
    .where(gte(revenueEntries.entryDate, monthStartStr))

  const totalEntries = Number(revTotals?.entries ?? 0)
  const avgRevPerBarberDay =
    totalEntries > 0 ? Number(revTotals?.total ?? 0) / totalEntries : 0

  const [actionAgg] = await db
    .select({
      open: sql<number>`count(*) filter (where ${actions.status} <> 'Closed')`,
      escalated: sql<number>`count(*) filter (where ${actions.escalated} = true and ${actions.status} <> 'Closed')`,
    })
    .from(actions)

  const ragCounts: Record<Rag, number> = { green: 0, amber: 0, red: 0 }
  for (const s of siteRows) ragCounts[s.rag]++

  return {
    groupRag: rollUpRag(siteRows.map((s) => s.rag)),
    monthRevenue,
    monthTarget,
    attainmentPct: monthTarget > 0 ? (monthRevenue / monthTarget) * 100 : 0,
    activeBarbers,
    siteCount: siteRows.length,
    avgRevPerBarberDay,
    openActions: Number(actionAgg?.open ?? 0),
    escalatedActions: Number(actionAgg?.escalated ?? 0),
    ragCounts,
  }
}

export type RevenueTrendPoint = { date: string; revenue: number }

export async function getGroupRevenueTrend(): Promise<RevenueTrendPoint[]> {
  const start = new Date()
  start.setDate(start.getDate() - 29)
  const startStr = start.toISOString().slice(0, 10)

  const rows = await db
    .select({
      date: revenueEntries.entryDate,
      revenue: sql<number>`coalesce(sum(${revenueEntries.revenue}), 0)`,
    })
    .from(revenueEntries)
    .where(gte(revenueEntries.entryDate, startStr))
    .groupBy(revenueEntries.entryDate)
    .orderBy(revenueEntries.entryDate)

  return rows.map((r) => ({
    date: String(r.date),
    revenue: Math.round(Number(r.revenue)),
  }))
}

export type KpiRow = {
  id: number
  code: string
  name: string
  category: string
  functionArea: string
  unit: string
  ownerRole: string
  greenThreshold: number | null
  amberThreshold: number | null
  direction: string
  frequency: string
  escalationRule: string | null
}

export async function getKpis(): Promise<KpiRow[]> {
  const rows = await db.select().from(kpis).orderBy(kpis.code)
  return rows.map((k) => ({
    id: k.id,
    code: k.code,
    name: k.name,
    category: k.category,
    functionArea: k.functionArea,
    unit: k.unit,
    ownerRole: k.ownerRole,
    greenThreshold: k.greenThreshold === null ? null : Number(k.greenThreshold),
    amberThreshold: k.amberThreshold === null ? null : Number(k.amberThreshold),
    direction: k.direction,
    frequency: k.frequency,
    escalationRule: k.escalationRule,
  }))
}

export type KpiScorecard = {
  kpiId: number
  code: string
  name: string
  category: string
  functionArea: string
  unit: string
  ownerRole: string
  groupValue: number
  rag: Rag
  perSite: { siteId: number | null; siteName: string; value: number; rag: Rag }[]
}

/** Latest period KPI values rolled up to group level. */
export async function getKpiScorecards(): Promise<KpiScorecard[]> {
  const kpiRows = await getKpis()
  const siteRows = await db.select().from(sites)
  const valueRows = await db.select().from(kpiValues)

  return kpiRows.map((k) => {
    const vals = valueRows.filter((v) => v.kpiId === k.id)
    // pick latest period present for this KPI
    const latestPeriod = vals
      .map((v) => v.period)
      .sort()
      .at(-1)
    const latest = vals.filter((v) => v.period === latestPeriod)

    const perSite = latest.map((v) => {
      const site = siteRows.find((s) => s.id === v.siteId)
      return {
        siteId: v.siteId,
        siteName: site ? site.name : "Group",
        value: Number(v.value),
        rag: v.rag as Rag,
      }
    })

    const groupValue =
      perSite.length > 0
        ? perSite.reduce((a, p) => a + p.value, 0) / perSite.length
        : 0
    const rag = rollUpRag(perSite.map((p) => p.rag))

    return {
      kpiId: k.id,
      code: k.code,
      name: k.name,
      category: k.category,
      functionArea: k.functionArea,
      unit: k.unit,
      ownerRole: k.ownerRole,
      groupValue,
      rag,
      perSite,
    }
  })
}

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
  const rows = await db
    .select()
    .from(actions)
    .orderBy(desc(actions.escalated), actions.dueDate)

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

export type DepartmentRow = {
  functionArea: string
  rag: Rag
  kpiCount: number
  openActions: number
}

export async function getDepartments(): Promise<DepartmentRow[]> {
  const scorecards = await getKpiScorecards()
  const actionRows = await getActions()

  const areas = new Map<string, { rags: Rag[]; kpiCount: number; open: number }>()
  for (const s of scorecards) {
    const entry = areas.get(s.functionArea) ?? { rags: [], kpiCount: 0, open: 0 }
    entry.rags.push(s.rag)
    entry.kpiCount++
    areas.set(s.functionArea, entry)
  }
  for (const a of actionRows) {
    const entry = areas.get(a.functionArea) ?? { rags: [], kpiCount: 0, open: 0 }
    if (a.status !== "Closed") entry.open++
    areas.set(a.functionArea, entry)
  }

  return Array.from(areas.entries())
    .map(([functionArea, v]) => ({
      functionArea,
      rag: rollUpRag(v.rags),
      kpiCount: v.kpiCount,
      openActions: v.open,
    }))
    .sort((a, b) => RAG_ORDER[a.rag] - RAG_ORDER[b.rag])
}

export async function updateActionStatus(id: number, status: string) {
  await db.update(actions).set({ status }).where(eq(actions.id, id))
}
