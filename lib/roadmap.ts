import "server-only"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  planAssumptions,
  leadershipSalaries,
  roadmapMilestones,
} from "@/lib/db/schema"
import {
  PLAN_MILESTONES,
  PLAN_BASE_YEAR,
  PLAN_TARGET_YEAR,
  PLAN_SALES_GOAL,
  milestoneFor,
} from "@/lib/plan"

// ---------------------------------------------------------------------------
// STRATEGIC ROADMAP ENGINE
//
// Turns the board-approved 5x5 plan (lib/plan.ts) into an explicit, time-phased
// roadmap with the financial assumptions that flow from it:
//   - corrected Training Academy economics (the original plan modelled the
//     academy conservatively as a flat 40%-growth revenue line; in reality the
//     academy runs 75 active learners each paying £1,200 per 3-month course),
//   - an indicative P&L -> post-tax profit -> dividend line,
//   - the performance-gated leadership salary schedule (commencing 2027).
//
// Everything here is data-driven: the figures live in editable DB tables so
// leadership can refine them in-app and watch the projection recompute.
// ---------------------------------------------------------------------------

export type AssumptionUnit = "number" | "gbp" | "pct" | "year" | "months"

export type Assumption = {
  key: string
  value: number
  label: string
  unit: AssumptionUnit
  description: string | null
  isPlaceholder: boolean
}

export type LeadershipSalary = {
  id: number
  role: string
  holder: string | null
  annualSalary: number
  shareClass: string | null
  startYear: number
  performanceGated: boolean
}

export type MilestoneCategory = "Expansion" | "Governance" | "Finance" | "Milestone"
export type MilestoneStatus = "Planned" | "In progress" | "Done" | "At risk"

export type Milestone = {
  id: number
  title: string
  detail: string | null
  category: MilestoneCategory
  targetYear: number
  targetMonth: number | null
  status: MilestoneStatus
  brand: string | null
  location: string | null
  sortOrder: number
}

const ASSUMPTION_DEFAULTS: Record<string, number> = {
  academy_active_learners: 75,
  academy_course_fee: 1200,
  academy_course_months: 3,
  corp_tax_rate: 0.25,
  dividend_pct: 0.3,
  dividend_start_year: 2027,
  operating_margin: 0.2,
}

// --- Reads -----------------------------------------------------------------

export async function getAssumptions(): Promise<Assumption[]> {
  const rows = await db.select().from(planAssumptions)
  return rows
    .map((r) => ({
      key: r.key,
      value: Number(r.value),
      label: r.label,
      unit: r.unit as AssumptionUnit,
      description: r.description,
      isPlaceholder: r.isPlaceholder,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Assumptions as a key->value map, falling back to defaults if unseeded. */
export async function getAssumptionMap(): Promise<Record<string, number>> {
  const rows = await getAssumptions()
  const map: Record<string, number> = { ...ASSUMPTION_DEFAULTS }
  for (const a of rows) map[a.key] = a.value
  return map
}

export async function getLeadershipSalaries(): Promise<LeadershipSalary[]> {
  const rows = await db
    .select()
    .from(leadershipSalaries)
    .orderBy(asc(leadershipSalaries.sortOrder))
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    holder: r.holder,
    annualSalary: Number(r.annualSalary),
    shareClass: r.shareClass,
    startYear: new Date(r.startDate).getFullYear(),
    performanceGated: r.performanceGated,
  }))
}

export async function getMilestones(now: Date = new Date()): Promise<Milestone[]> {
  const rows = await db
    .select()
    .from(roadmapMilestones)
    .orderBy(asc(roadmapMilestones.sortOrder))
  const nowIdx = now.getFullYear() * 12 + now.getMonth()
  return rows.map((r) => {
    let status = r.status as MilestoneStatus
    // Date-aware self-correction: any item still "Planned" whose target month
    // has already passed is surfaced as "At risk" so the roadmap never shows a
    // stale future-looking status for work that should already have happened.
    const targetIdx = r.targetYear * 12 + ((r.targetMonth ?? 1) - 1)
    if (status === "Planned" && targetIdx < nowIdx) status = "At risk"
    return {
      id: r.id,
      title: r.title,
      detail: r.detail,
      category: r.category as MilestoneCategory,
      targetYear: r.targetYear,
      targetMonth: r.targetMonth,
      status,
      brand: r.brand,
      location: r.location,
      sortOrder: r.sortOrder,
    }
  })
}

// --- Academy economics -----------------------------------------------------

/**
 * Corrected steady-state annual academy revenue. 75 active learners each pay
 * `fee` per `courseMonths`-month course, i.e. (12 / courseMonths) courses a
 * year. With defaults: 75 × £1,200 × (12/3) = £360,000.
 */
export function correctedAcademyAnnual(map: Record<string, number>): number {
  const learners = map.academy_active_learners
  const fee = map.academy_course_fee
  const months = map.academy_course_months || 3
  const coursesPerYear = 12 / months
  return Math.round(learners * fee * coursesPerYear)
}

export type AcademyComparison = {
  /** The conservative plan line per year (from PLAN_MILESTONES). */
  conservativeByYear: { year: number; value: number }[]
  /** Corrected steady-state annual revenue. */
  correctedAnnual: number
  /** Upside vs the 2030 conservative figure. */
  upsideVs2030: number
}

export function academyComparison(map: Record<string, number>): AcademyComparison {
  const corrected = correctedAcademyAnnual(map)
  const conservativeByYear = PLAN_MILESTONES.map((m) => ({
    year: m.year,
    value: m.academyTurnover,
  }))
  const last = PLAN_MILESTONES[PLAN_MILESTONES.length - 1].academyTurnover
  return {
    conservativeByYear,
    correctedAnnual: corrected,
    upsideVs2030: corrected - last,
  }
}

// --- Projection (P&L -> profit -> dividend) --------------------------------

export type YearProjection = {
  year: number
  shops: number
  barberingTurnover: number
  academyTurnover: number // corrected academy figure
  totalTurnover: number
  operatingProfit: number // pre-salary, indicative
  leadershipCost: number // salaries active that year
  preTaxProfit: number
  tax: number
  postTaxProfit: number
  dividend: number
}

/**
 * Build the full multi-year projection. Barbering turnover comes straight from
 * the board plan; academy turnover is replaced with the corrected steady-state
 * figure (ramped in linearly from the plan's first-year academy figure to the
 * corrected run-rate by the target year). Profit, tax and dividends are
 * indicative and driven by the editable assumptions.
 */
export async function getProjection(): Promise<{
  years: YearProjection[]
  map: Record<string, number>
  salaries: LeadershipSalary[]
}> {
  const map = await getAssumptionMap()
  const salaries = await getLeadershipSalaries()
  const corrected = correctedAcademyAnnual(map)
  const margin = map.operating_margin
  const taxRate = map.corp_tax_rate
  const dividendPct = map.dividend_pct
  const dividendStart = map.dividend_start_year

  const firstAcademy = PLAN_MILESTONES[0].academyTurnover || corrected
  const span = Math.max(1, PLAN_TARGET_YEAR - PLAN_BASE_YEAR)

  const years: YearProjection[] = PLAN_MILESTONES.map((m) => {
    // Ramp the corrected academy revenue in from the base year to target year.
    const t = (m.year - PLAN_BASE_YEAR) / span
    const academyTurnover = Math.round(firstAcademy + (corrected - firstAcademy) * t)
    const totalTurnover = m.barberingTurnover + academyTurnover
    const operatingProfit = Math.round(totalTurnover * margin)

    const leadershipCost = salaries
      .filter((s) => m.year >= s.startYear)
      .reduce((sum, s) => sum + s.annualSalary, 0)

    const preTaxProfit = operatingProfit - leadershipCost
    const tax = preTaxProfit > 0 ? Math.round(preTaxProfit * taxRate) : 0
    const postTaxProfit = preTaxProfit - tax
    const dividend =
      m.year >= dividendStart && postTaxProfit > 0
        ? Math.round(postTaxProfit * dividendPct)
        : 0

    return {
      year: m.year,
      shops: m.shops,
      barberingTurnover: m.barberingTurnover,
      academyTurnover,
      totalTurnover,
      operatingProfit,
      leadershipCost,
      preTaxProfit,
      tax,
      postTaxProfit,
      dividend,
    }
  })

  return { years, map, salaries }
}

// --- Progress headline ------------------------------------------------------

export type RoadmapProgress = {
  shopsOpen: number
  shopsPlanned: number
  yearsElapsed: number
  yearsTotal: number
  pctThroughPlan: number // 0-100, time-based
  currentBarberingTarget: number
  salesGoal: number
  pctToGoal: number // 0-100, current-year barbering vs £5m goal
  nextMilestone: Milestone | null
  doneCount: number
  totalCount: number
}

export async function getRoadmapProgress(now: Date = new Date()): Promise<RoadmapProgress> {
  const milestones = await getMilestones(now)
  const year = now.getFullYear()
  const current = milestoneFor(year)

  const yearsElapsed = Math.min(
    Math.max(0, year - PLAN_BASE_YEAR),
    PLAN_TARGET_YEAR - PLAN_BASE_YEAR,
  )
  const yearsTotal = PLAN_TARGET_YEAR - PLAN_BASE_YEAR

  const monthIdx = year * 12 + now.getMonth()
  const upcoming = milestones
    .filter((m) => {
      const mi = m.targetYear * 12 + ((m.targetMonth ?? 1) - 1)
      return mi >= monthIdx && m.status !== "Done"
    })
    .sort(
      (a, b) =>
        a.targetYear * 12 + ((a.targetMonth ?? 1) - 1) -
        (b.targetYear * 12 + ((b.targetMonth ?? 1) - 1)),
    )

  // Shops open is driven by the actual reconciled milestones (a site counts as
  // open once its expansion milestone is marked Done), not the aspirational
  // opening schedule — so the headline reflects reality, not the plan's intent.
  const expansion = milestones.filter((m) => m.category === "Expansion")
  const shopsOpen = expansion.filter((m) => m.status === "Done").length

  return {
    shopsOpen,
    shopsPlanned: expansion.length,
    yearsElapsed,
    yearsTotal,
    pctThroughPlan: Math.round((yearsElapsed / yearsTotal) * 100),
    currentBarberingTarget: current.barberingTurnover,
    salesGoal: PLAN_SALES_GOAL,
    pctToGoal: Math.min(100, Math.round((current.barberingTurnover / PLAN_SALES_GOAL) * 100)),
    nextMilestone: upcoming[0] ?? null,
    doneCount: milestones.filter((m) => m.status === "Done").length,
    totalCount: milestones.length,
  }
}

// --- Mutations -------------------------------------------------------------

export async function updateAssumptionValue(key: string, value: number) {
  await db
    .update(planAssumptions)
    .set({ value: String(value), updatedAt: new Date() })
    .where(eq(planAssumptions.key, key))
}

export async function updateSalary(id: number, annualSalary: number, startYear: number) {
  await db
    .update(leadershipSalaries)
    .set({
      annualSalary: String(annualSalary),
      startDate: `${startYear}-01-01`,
    })
    .where(eq(leadershipSalaries.id, id))
}

export async function updateMilestoneStatus(id: number, status: MilestoneStatus) {
  await db
    .update(roadmapMilestones)
    .set({ status })
    .where(eq(roadmapMilestones.id, id))
}
