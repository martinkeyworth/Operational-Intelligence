// Single source of truth for the Less Than Zero Group 2025–2030 business plan.
// Every projection, target, and report in the app should trace back to these
// figures so the dashboard stays faithful to the board-approved plan.

export type BrandTierName = "Mid" | "Youth" | "Elite"

/** Annual barbering turnover milestones (gross, excludes Training Academy). */
export type PlanMilestone = {
  year: number
  shops: number
  barberingTurnover: number
  academyTurnover: number
  get totalTurnover(): number
}

function milestone(
  year: number,
  shops: number,
  barberingTurnover: number,
  academyTurnover: number,
): PlanMilestone {
  return {
    year,
    shops,
    barberingTurnover,
    academyTurnover,
    get totalTurnover() {
      return this.barberingTurnover + this.academyTurnover
    },
  }
}

// Barbering gross turnover + Training Academy income (Academy sits on top and is
// excluded from the £5m barbering goal).
export const PLAN_MILESTONES: PlanMilestone[] = [
  milestone(2025, 2, 450_000, 0),
  milestone(2026, 6, 1_485_000, 70_000),
  milestone(2027, 9, 2_508_000, 98_000),
  milestone(2028, 12, 3_720_750, 137_200),
  milestone(2029, 15, 5_150_970, 192_080),
  milestone(2030, 15, 5_666_067, 268_912),
]

export const PLAN_BASE_YEAR = PLAN_MILESTONES[0].year
export const PLAN_TARGET_YEAR = PLAN_MILESTONES[PLAN_MILESTONES.length - 1].year
/** Headline goal: £5m barbering turnover (first crossed in 2029). */
export const PLAN_SALES_GOAL = 5_000_000

/** Brand tier economics: per-barber GROSS revenue per year, +10% annually. */
export type BrandTier = {
  name: BrandTierName
  basePerBarberRevenue: number // 2025 base, gross per barber per year
  growth: number // annual growth rate
  launchYear: number // first year this tier trades
}

export const BRAND_TIERS: Record<BrandTierName, BrandTier> = {
  Mid: { name: "Mid", basePerBarberRevenue: 50_000, growth: 0.1, launchYear: 2025 },
  Youth: { name: "Youth", basePerBarberRevenue: 40_000, growth: 0.1, launchYear: 2025 },
  Elite: { name: "Elite", basePerBarberRevenue: 60_000, growth: 0.1, launchYear: 2027 },
}

/** Per-barber gross revenue per YEAR for a tier in a given year (+10%/yr). */
export function perBarberRevenue(tier: BrandTierName, year: number): number {
  const t = BRAND_TIERS[tier]
  const steps = Math.max(0, year - PLAN_BASE_YEAR)
  return Math.round(t.basePerBarberRevenue * Math.pow(1 + t.growth, steps))
}

/** Per-barber gross revenue per WEEK (52-week year) for a tier in a year. */
export function perBarberWeeklyRevenue(tier: BrandTierName, year: number): number {
  return Math.round(perBarberRevenue(tier, year) / 52)
}

// Map the app's existing site brand strings onto plan tiers. Keys are matched
// case-insensitively against `sites.brand`.
export const BRAND_TIER_MAP: Record<string, BrandTierName> = {
  "less than zero": "Mid",
  ltz: "Mid",
  "f.af": "Youth",
  faf: "Youth",
  "velvet ash": "Elite",
}

export function tierForBrand(brand: string | null | undefined): BrandTierName {
  if (!brand) return "Mid"
  return BRAND_TIER_MAP[brand.trim().toLowerCase()] ?? "Mid"
}

/** The plan's fixed 15-shop opening schedule (2025–2029). */
export type PlannedOpening = {
  year: number
  month: number // 1-12
  tier: BrandTierName
  location: string
  barbers: number // cutting staff excluding manager
  manager: number
  apprentices: number
}

const o = (
  year: number,
  month: number,
  tier: BrandTierName,
  location: string,
): PlannedOpening => ({ year, month, tier, location, barbers: 4, manager: 1, apprentices: 1 })

export const OPENING_SCHEDULE: PlannedOpening[] = [
  o(2025, 6, "Mid", "Claycross"),
  o(2025, 8, "Youth", "Chesterfield"),
  o(2026, 4, "Youth", "Rotherham"),
  o(2026, 7, "Mid", "Mansfield"),
  o(2026, 9, "Youth", "Derby"),
  o(2026, 10, "Mid", "Dronfield"),
  o(2027, 3, "Mid", "Nottingham"),
  o(2027, 7, "Youth", "Leicester"),
  o(2027, 10, "Elite", "Sheffield"),
  o(2028, 3, "Mid", "Sheffield"),
  o(2028, 7, "Youth", "Birmingham"),
  o(2028, 10, "Elite", "Manchester"),
  o(2029, 4, "Youth", "Liverpool"),
  o(2029, 8, "Mid", "Leeds"),
  o(2029, 10, "Elite", "London"),
]

/** Cumulative shops open as of a given date, per the plan schedule. */
export function cumulativeShopsByMonth(date: Date = new Date()): number {
  const idx = date.getFullYear() * 12 + date.getMonth() // 0-based month
  return OPENING_SCHEDULE.filter((s) => s.year * 12 + (s.month - 1) <= idx).length
}

/** The next planned opening on/after the given date (null if all open). */
export function nextPlannedOpening(date: Date = new Date()): PlannedOpening | null {
  const idx = date.getFullYear() * 12 + date.getMonth()
  return (
    OPENING_SCHEDULE.find((s) => s.year * 12 + (s.month - 1) >= idx) ?? null
  )
}

// Cost & operating assumptions (per shop unless noted).
export const PLAN_ASSUMPTIONS = {
  barbersPerShop: 4,
  managersPerShop: 1,
  apprenticesPerShop: 1,
  apprenticeWeeklyWage: 300,
  apprenticeContractMonths: 13,
  revenueSplit: 0.5, // 50/50 barber/house split
  managerBonusPctOfGross: 0.1, // manager earns extra 10% of shop gross
  rentMonthly: 1_000,
  utilitiesMonthly: 500,
  suppliesMonthly: 200,
  marketingAnnualPerBrand: 2_000,
  capexPerChair: 500,
  capexSetup: 2_000,
  weeksPerYear: 52,
} as const

/** RTB (revenue-to-business) is the house share of gross. */
export const PLAN_RTB_GOAL = Math.round(PLAN_SALES_GOAL * PLAN_ASSUMPTIONS.revenueSplit)

/**
 * Flat board assumption: every barber is expected to return £500/week to the
 * business (the RTB KPI). Actuals are RAG'd against barbers × £500. This is the
 * single source of truth for the per-barber RTB target across the app.
 */
export const RTB_PER_BARBER_WEEKLY = 500

/** Linear-interpolated barbering turnover target for any month in range. */
export function barberingTargetForMonth(year: number, month1to12: number): number {
  const first = PLAN_MILESTONES[0]
  const last = PLAN_MILESTONES[PLAN_MILESTONES.length - 1]
  if (year <= first.year) return first.barberingTurnover
  if (year >= last.year) return last.barberingTurnover

  const prev = PLAN_MILESTONES.find((m) => m.year === year - 1) ?? first
  const curr = PLAN_MILESTONES.find((m) => m.year === year) ?? last
  // Distribute the year-on-year step across 12 months.
  const frac = (month1to12 - 1) / 12
  return Math.round(
    prev.barberingTurnover +
      (curr.barberingTurnover - prev.barberingTurnover) * frac,
  )
}

export function milestoneFor(year: number): PlanMilestone {
  return (
    PLAN_MILESTONES.find((m) => m.year === year) ??
    (year < PLAN_BASE_YEAR ? PLAN_MILESTONES[0] : PLAN_MILESTONES[PLAN_MILESTONES.length - 1])
  )
}
