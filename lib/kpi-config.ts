// ---------------------------------------------------------------------------
// KPI catalogue + scoring — every functional area defines weekly KPIs that are
// scored RAG against industry-standard thresholds, rolled up to a per-area RAG
// (weighted), then to a single overall business RAG (weighted across areas).
// ---------------------------------------------------------------------------

import type { Rag } from "@/lib/format"
import { PLAN_ASSUMPTIONS } from "@/lib/plan"

// Marketing budget derived from the plan: £2k/yr per brand across the active
// brands, expressed as a weekly group budget for KPI scoring.
export const MARKETING_BRAND_COUNT = 3
export const MARKETING_WEEKLY_BUDGET = Math.round(
  (PLAN_ASSUMPTIONS.marketingAnnualPerBrand * MARKETING_BRAND_COUNT) /
    PLAN_ASSUMPTIONS.weeksPerYear,
)

export type KpiDirection = "higher_better" | "lower_better"

export type KpiDef = {
  // Stable code stored in kpis.code and used to match kpi_values.
  code: string
  name: string
  functionArea: string
  unit: string
  // green: at/over (higher_better) or at/under (lower_better) this value.
  // amber: between green and amber threshold. Beyond amber = red.
  green: number
  amber: number
  direction: KpiDirection
  ownerRole: string
  // Named accountable owner for this KPI (the single person on the hook).
  // Falls back to the ownerRole label when no individual is named.
  owner?: string
  // Relative weight of this KPI within its functional area.
  weight: number
  help: string
}

// Industry-standard weekly KPI catalogue for the six functional areas. Some
// areas (Capacity/RTB/Revenue/Subletting/Training) are scored from operational
// data elsewhere; the manually-entered KPIs below cover HR and Marketing plus
// any qualitative weekly measures. Thresholds are sensible defaults and can be
// tuned later by editing this file.
export const KPI_CATALOGUE: KpiDef[] = [
  // ---- People & HR --------------------------------------------------------
  {
    code: "hr_vacancies",
    name: "Open vacancies (chairs to fill)",
    functionArea: "HR",
    unit: "roles",
    green: 1,
    amber: 3,
    direction: "lower_better",
    ownerRole: "HR Lead",
    weight: 1,
    help: "Unfilled chairs/roles across the group. Empty chairs directly cost capacity.",
  },
  {
    code: "hr_leavers",
    name: "Leavers this week",
    functionArea: "HR",
    unit: "people",
    green: 0,
    amber: 1,
    direction: "lower_better",
    ownerRole: "HR Lead",
    weight: 1,
    help: "Staff turnover this week. Repeated leavers signal a retention problem.",
  },
  {
    code: "hr_compliance",
    name: "Compliance items outstanding",
    functionArea: "HR",
    unit: "items",
    green: 0,
    amber: 2,
    direction: "lower_better",
    ownerRole: "HR Lead",
    weight: 1.5,
    help: "Right-to-work, contracts and certifications overdue. Compliance is weighted heavily.",
  },
  // ---- Marketing & Social -------------------------------------------------
  {
    code: "mkt_posts",
    name: "Social posts published",
    functionArea: "Marketing",
    unit: "posts",
    green: 5,
    amber: 3,
    direction: "higher_better",
    ownerRole: "Social Media",
    weight: 1,
    help: "Weekly content cadence across channels. Target 5+ posts/week.",
  },
  {
    code: "mkt_rating",
    name: "Google rating (avg)",
    functionArea: "Marketing",
    unit: "★",
    green: 4.5,
    amber: 4.0,
    direction: "higher_better",
    ownerRole: "Social Media",
    weight: 1.5,
    help: "Average Google review rating. Reputation is weighted heavily.",
  },
  {
    code: "mkt_bookings",
    name: "Bookings from marketing",
    functionArea: "Marketing",
    unit: "bookings",
    green: 20,
    amber: 10,
    direction: "higher_better",
    ownerRole: "Social Media",
    weight: 1,
    help: "Leads/bookings attributed to campaigns this week.",
  },
  {
    code: "mkt_spend",
    name: "Marketing spend this week (£)",
    functionArea: "Marketing",
    unit: "£",
    // Plan budget: £2k/yr per brand. Weekly group budget is set in kpi-config
    // from PLAN_ASSUMPTIONS so the threshold tracks the board-approved plan.
    green: MARKETING_WEEKLY_BUDGET,
    amber: Math.round(MARKETING_WEEKLY_BUDGET * 1.3),
    direction: "lower_better",
    ownerRole: "Social Media",
    weight: 1,
    help: `Total marketing spend this week vs the plan budget of £${PLAN_ASSUMPTIONS.marketingAnnualPerBrand.toLocaleString()}/yr per brand (${MARKETING_BRAND_COUNT} brands ≈ £${MARKETING_WEEKLY_BUDGET}/week). On/under budget is green.`,
  },
  {
    code: "mkt_free_haircuts",
    name: "Free haircuts given",
    functionArea: "Marketing",
    unit: "cuts",
    // Community/brand-building leading indicator: complimentary cuts (charity,
    // schools, content, influencer/seeding). Higher is better — target 8+/week.
    green: 8,
    amber: 4,
    direction: "higher_better",
    ownerRole: "Social Media",
    weight: 1,
    help: "Complimentary cuts given this week for community, content and outreach (charity, schools, influencer seeding). A leading indicator of brand reach and goodwill — target 8+/week.",
  },
]

export function kpisForArea(areaKey: string): KpiDef[] {
  return KPI_CATALOGUE.filter((k) => k.functionArea === areaKey)
}

export function findKpi(code: string): KpiDef | undefined {
  return KPI_CATALOGUE.find((k) => k.code === code)
}

/** Score a single KPI value against its thresholds. */
export function scoreKpi(def: KpiDef, value: number): Rag {
  if (def.direction === "higher_better") {
    if (value >= def.green) return "green"
    if (value >= def.amber) return "amber"
    return "red"
  }
  // lower_better
  if (value <= def.green) return "green"
  if (value <= def.amber) return "amber"
  return "red"
}

// ---------------------------------------------------------------------------
// Weighted RAG roll-up (industry "weighted score band" logic).
//   green = 2, amber = 1, red = 0. Weighted average mapped to a band:
//     >= 1.7  -> green   (≈ 85%+)
//     >= 1.2  -> amber   (≈ 60–85%)
//     <  1.2  -> red
// ---------------------------------------------------------------------------

export const RAG_POINTS: Record<Rag, number> = { green: 2, amber: 1, red: 0 }

export type WeightedRag = { item: Rag; weight: number }

export function rollUpWeighted(items: WeightedRag[]): {
  rag: Rag
  score: number
  pct: number
} {
  const totalWeight = items.reduce((a, i) => a + i.weight, 0)
  if (totalWeight === 0) return { rag: "green", score: 2, pct: 100 }
  const weighted =
    items.reduce((a, i) => a + RAG_POINTS[i.item] * i.weight, 0) / totalWeight
  const pct = Math.round((weighted / 2) * 100)
  const rag: Rag = weighted >= 1.7 ? "green" : weighted >= 1.2 ? "amber" : "red"
  return { rag, score: Number(weighted.toFixed(2)), pct }
}

// Relative weight of each functional area in the overall business RAG. Revenue-
// driving areas carry more weight than supporting functions.
export const AREA_WEIGHTS: Record<string, number> = {
  Capacity: 1.5,
  RTB: 1.5,
  Subletting: 1,
  Training: 1,
  HR: 1.25,
  Marketing: 0.75,
}
