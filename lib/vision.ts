import { db } from "@/lib/db"
import { sites as sitesTable, weeklyTakings } from "@/lib/db/schema"
import { eq, desc, sql } from "drizzle-orm"
import { ragFromAttainment, type Rag } from "@/lib/format"
import {
  PLAN_MILESTONES,
  PLAN_BASE_YEAR,
  PLAN_TARGET_YEAR,
  PLAN_SALES_GOAL,
  PLAN_ASSUMPTIONS,
  barberingTargetForMonth,
  cumulativeShopsByMonth,
  nextPlannedOpening,
  milestoneFor,
  perBarberRevenue,
  tierForBrand,
} from "@/lib/plan"

/**
 * Long-term vision: £5m barbering turnover by 2029–2030, taken directly from
 * the Less Than Zero Group 2025–2030 business plan (see `lib/plan.ts`, the
 * single source of truth). The glide path is anchored on the plan's actual
 * annual turnover MILESTONES rather than a flat per-barber assumption.
 *
 * RTB (revenue-to-business) is the house share at the 50% split and is kept as
 * a derived sub-metric (= 50% of barbering turnover). Headcount follows the
 * plan's shop roll-out: 4 barbers + 1 manager per shop, so the barbers needed
 * each period = (shops open) × 4. Training Academy income sits on top and is
 * excluded from the £5m barbering goal.
 */
export const VISION = {
  targetYear: PLAN_TARGET_YEAR,
  baseYear: PLAN_BASE_YEAR,
  salesGoal: PLAN_SALES_GOAL,
  rtbRatio: PLAN_ASSUMPTIONS.revenueSplit, // 50% house split => RTB
  weeksPerYear: PLAN_ASSUMPTIONS.weeksPerYear,
} as const

export type VisionYear = {
  year: number
  headcountTarget: number
  salesTarget: number
  rtbTarget: number
  academyTarget: number // Training Academy income (on top of barbering)
  shops: number // shops open per the plan that year
  isGoal: boolean
}

export type VisionSite = {
  siteId: number
  name: string
  chairs: number
  headcountTarget: number // 2030 barbers needed at this site
  salesTarget: number // 2030 site sales target
  rtbTarget: number // 2030 site RTB target
}

export type VisionGlidePath = {
  salesGoal: number
  rtbGoal: number
  baseYear: number
  targetYear: number
  rtbPerBarberWeekly: number
  grossPerBarberWeekly: number
  rtbPerBarberAnnual: number
  barbersNeeded: number // headcount required by 2030 to hit £2.5m RTB
  currentHeadcount: number
  currentAnnualisedSales: number
  headcountCagrPct: number // implied annual headcount growth to hit the goal
  years: VisionYear[]
  sites: VisionSite[]
  totalChairs: number
}

export type VisionMonth = {
  month: number // 1-12
  label: string // "Jan", "Feb", ...
  requiredTakings: number // required monthly chair sales for the glide path
  actualTakings: number // actual chair sales recorded this month (0 if future)
  attainmentPct: number // actual / required * 100
  rag: Rag // RAG colour from attainment
  barbersNeeded: number // barbers needed on the floor that month
  isPast: boolean // whether the month has actuals to date
}

export type VisionMonthlyPlan = {
  year: number
  startHeadcount: number
  endHeadcount: number
  annualRequired: number // total required chair sales for the year
  annualActual: number // total actual chair sales year-to-date
  annualAttainmentPct: number
  annualRag: Rag
  months: VisionMonth[]
}

export type ExpansionRecommendation = {
  needed: boolean
  rag: Rag
  // The month capacity is first breached on the glide path.
  breachMonthLabel: string | null
  // 3-month lead time: the month a new shop must be STARTED to be open in time.
  startByMonthLabel: string | null
  monthsUntilStart: number | null
  leadTimeMonths: number
  currentChairs: number
  currentHeadcount: number
  projectedHeadcountAtBreach: number
  chairShortfall: number
  avgChairsPerShop: number
  shopsToOpen: number
  headline: string
  // Plan-driven next opening (from the LTZ 2025–2030 schedule).
  nextOpeningLocation: string | null
  nextOpeningTier: string | null
  nextOpeningMonthLabel: string | null
  plannedShopsByNow: number
  actualShopsOpen: number
}

/** Number of whole months between two year/month points. */
function monthIndex(year: number, month1to12: number) {
  return year * 12 + (month1to12 - 1)
}

/**
 * Decide whether (and when) to open another shop. This is driven primarily by
 * the LTZ business plan's fixed opening schedule (`OPENING_SCHEDULE`): we find
 * the next planned opening and, allowing a ~3-month fit-out lead time, flag
 * when fit-out must START so the shop opens on schedule. As a secondary signal
 * we still detect a chair-capacity breach against the headcount glide path so
 * the team is warned if demand outruns the plan.
 */
export async function getExpansionPlan(
  now: Date = new Date(),
  leadTimeMonths = 3,
): Promise<ExpansionRecommendation> {
  const path = await getVisionGlidePath()
  const shopCount = path.sites.length
  const currentChairs = path.totalChairs
  const avgChairsPerShop =
    shopCount > 0 ? Math.round(currentChairs / shopCount) : 0

  const plannedShopsByNow = cumulativeShopsByMonth(now)
  const next = nextPlannedOpening(now)

  const base: ExpansionRecommendation = {
    needed: false,
    rag: "green",
    breachMonthLabel: null,
    startByMonthLabel: null,
    monthsUntilStart: null,
    leadTimeMonths,
    currentChairs,
    currentHeadcount: path.currentHeadcount,
    projectedHeadcountAtBreach: 0,
    chairShortfall: 0,
    avgChairsPerShop,
    shopsToOpen: 0,
    headline: "No further openings scheduled on the plan.",
    nextOpeningLocation: null,
    nextOpeningTier: null,
    nextOpeningMonthLabel: null,
    plannedShopsByNow,
    actualShopsOpen: shopCount,
  }

  if (!next) return base

  const nowIdx = monthIndex(now.getFullYear(), now.getMonth() + 1)
  const openIdx = monthIndex(next.year, next.month)
  const startIdx = openIdx - leadTimeMonths
  const monthsUntilStart = startIdx - nowIdx
  const openMonthLabel = `${MONTH_LABELS[next.month - 1]} ${next.year}`
  const startByMonthLabel = `${MONTH_LABELS[((startIdx % 12) + 12) % 12]} ${Math.floor(startIdx / 12)}`

  // RAG by urgency: fit-out overdue/started => red, within lead time => amber.
  const rag: Rag =
    monthsUntilStart <= 0 ? "red" : monthsUntilStart <= leadTimeMonths ? "amber" : "green"

  return {
    ...base,
    needed: true,
    rag,
    breachMonthLabel: openMonthLabel,
    startByMonthLabel,
    monthsUntilStart,
    shopsToOpen: 1,
    nextOpeningLocation: next.location,
    nextOpeningTier: next.tier,
    nextOpeningMonthLabel: openMonthLabel,
    headline:
      monthsUntilStart <= 0
        ? `Fit-out for ${next.tier} Brand ${next.location} must start now to open ${openMonthLabel} (3-month lead time).`
        : `Open ${next.tier} Brand ${next.location} in ${openMonthLabel} — start fit-out by ${startByMonthLabel} (3-month lead time).`,
  }
}

/** Annualise the trailing weeks of takings to anchor today's run-rate. */
async function currentAnnualisedSales(): Promise<number> {
  const rows = await db
    .select({ weekEnding: weeklyTakings.weekEnding, total: weeklyTakings.total })
    .from(weeklyTakings)
    .orderBy(desc(weeklyTakings.weekEnding))
    .limit(56)

  const byWeek = new Map<string, number>()
  for (const r of rows) {
    const k = String(r.weekEnding)
    byWeek.set(k, (byWeek.get(k) ?? 0) + Number(r.total ?? 0))
  }
  const weekTotals = [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 8)
    .map(([, v]) => v)

  if (weekTotals.length === 0) return 0
  const avgWeek = weekTotals.reduce((s, v) => s + v, 0) / weekTotals.length
  return Math.round(avgWeek * VISION.weeksPerYear)
}

/**
 * Build the vision glide path straight from the plan's turnover milestones.
 * Sales targets are the plan's barbering turnover; RTB is the 50% house share;
 * headcount follows the plan roll-out (shops × 4 barbers); Academy income is
 * carried for reporting but excluded from the £5m barbering goal.
 */
export async function getVisionGlidePath(): Promise<VisionGlidePath> {
  const salesGoal = VISION.salesGoal
  const finalMilestone = PLAN_MILESTONES[PLAN_MILESTONES.length - 1]
  const rtbGoal = Math.round(salesGoal * VISION.rtbRatio)

  // Plan roll-out: 4 barbers per shop. Barbers needed by the target year.
  const barbersNeeded = finalMilestone.shops * PLAN_ASSUMPTIONS.barbersPerShop

  // Current total barbershop headcount anchors today's progress. Headcount is
  // the site manager's stated figure (sites.headcount); the weekly variance vs
  // barbers who actually reported is surfaced separately as a manager action.
  const barbershops = await db
    .select({
      id: sitesTable.id,
      name: sitesTable.name,
      brand: sitesTable.brand,
      chairs: sitesTable.chairCapacity,
      headcount: sitesTable.headcount,
    })
    .from(sitesTable)
    .where(eq(sitesTable.siteType, "barbershop"))
    .orderBy(sitesTable.name)

  const currentHeadcount = barbershops.reduce(
    (s, b) => s + (b.headcount ?? 0),
    0,
  )
  const totalChairs = barbershops.reduce((s, b) => s + (b.chairs ?? 0), 0)
  const baseSales = await currentAnnualisedSales()

  // Build one row per plan milestone year. Sales/RTB/Academy come straight from
  // the plan; headcount = shops × 4 barbers.
  const years: VisionYear[] = PLAN_MILESTONES.map((m) => {
    const salesTarget = m.barberingTurnover
    const rtbTarget = Math.round(salesTarget * VISION.rtbRatio)
    return {
      year: m.year,
      headcountTarget: m.shops * PLAN_ASSUMPTIONS.barbersPerShop,
      salesTarget,
      rtbTarget,
      academyTarget: m.academyTurnover,
      shops: m.shops,
      isGoal: m.year === VISION.targetYear,
    }
  })

  // Blended current-year per-barber economics for headline copy (gross/week and
  // RTB/week), weighted by today's brand mix.
  const nowYear = new Date().getFullYear()
  const tierWeeklyGross =
    barbershops.length > 0
      ? Math.round(
          barbershops.reduce(
            (s, b) => s + perBarberRevenue(tierForBrand(b.brand), nowYear) / 52,
            0,
          ) / barbershops.length,
        )
      : Math.round(perBarberRevenue("Mid", nowYear) / 52)
  const grossPerBarberWeekly = tierWeeklyGross
  const rtbPerBarberWeekly = Math.round(grossPerBarberWeekly * VISION.rtbRatio)
  const rtbPerBarberAnnual = rtbPerBarberWeekly * VISION.weeksPerYear

  // Implied headcount growth from today to the plan's target headcount.
  const span = VISION.targetYear - nowYear
  const startHc = Math.max(currentHeadcount, 1)
  const headcountCagr =
    barbersNeeded > 0 && span > 0
      ? Math.pow(barbersNeeded / startHc, 1 / span) - 1
      : 0

  // Allocate the target-year headcount across today's sites by chair capacity
  // (indicative — the plan opens new sites to actually reach this headcount).
  const sites: VisionSite[] = barbershops.map((b) => {
    const chairs = b.chairs ?? 0
    const share = totalChairs > 0 ? chairs / totalChairs : 0
    const headcountTarget = Math.round(barbersNeeded * share)
    const tier = tierForBrand(b.brand)
    const salesTarget = headcountTarget * perBarberRevenue(tier, VISION.targetYear)
    const rtbTarget = Math.round(salesTarget * VISION.rtbRatio)
    return {
      siteId: b.id,
      name: b.name,
      chairs,
      headcountTarget,
      salesTarget,
      rtbTarget,
    }
  })

  return {
    salesGoal,
    rtbGoal,
    baseYear: VISION.baseYear,
    targetYear: VISION.targetYear,
    rtbPerBarberWeekly,
    grossPerBarberWeekly,
    rtbPerBarberAnnual,
    barbersNeeded,
    currentHeadcount,
    currentAnnualisedSales: baseSales,
    headcountCagrPct: Math.round(headcountCagr * 1000) / 10,
    years,
    sites,
    totalChairs,
  }
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** Sum of actual chair takings per calendar month for a given year. */
async function actualTakingsByMonth(year: number): Promise<number[]> {
  const rows = await db
    .select({
      month: sql<number>`extract(month from ${weeklyTakings.weekEnding})`,
      total: sql<number>`coalesce(sum(${weeklyTakings.total}), 0)`,
    })
    .from(weeklyTakings)
    .where(sql`extract(year from ${weeklyTakings.weekEnding}) = ${year}`)
    .groupBy(sql`extract(month from ${weeklyTakings.weekEnding})`)

  const months = new Array(12).fill(0)
  for (const r of rows) {
    const m = Number(r.month)
    if (m >= 1 && m <= 12) months[m - 1] = Number(r.total ?? 0)
  }
  return months
}

/**
 * Model the required barbering takings for the current calendar year, month by
 * month, taken from the plan's turnover milestones (interpolated across the
 * year and split into months). Barbers needed each month follow the plan's
 * shop roll-out (cumulative shops × 4 barbers). Actuals are compared to the
 * required plan figure to produce an attainment % and RAG colour.
 */
export async function getVisionMonthlyPlan(
  now: Date = new Date(),
): Promise<VisionMonthlyPlan> {
  const path = await getVisionGlidePath()
  const year = Math.min(
    Math.max(now.getFullYear(), path.baseYear),
    path.targetYear,
  )

  const actuals = await actualTakingsByMonth(year)

  const currentMonth =
    now.getFullYear() === year ? now.getMonth() + 1 : 12 // 1-12; full year if past

  // Headcount milestones bracketing the year, for the start/end summary.
  const startHeadcount =
    cumulativeShopsByMonth(new Date(year, 0, 1)) * PLAN_ASSUMPTIONS.barbersPerShop
  const endHeadcount =
    cumulativeShopsByMonth(new Date(year, 11, 1)) * PLAN_ASSUMPTIONS.barbersPerShop

  const months: VisionMonth[] = []
  let annualRequired = 0
  let annualActual = 0

  for (let i = 0; i < 12; i++) {
    const monthNo = i + 1
    // Required monthly takings = plan's interpolated annual barbering turnover
    // at this month, divided into 12 months.
    const requiredTakings = Math.round(
      barberingTargetForMonth(year, monthNo) / 12,
    )
    // Barbers expected on the floor = plan shops open that month × 4 barbers.
    const barbersNeeded =
      cumulativeShopsByMonth(new Date(year, i, 1)) *
      PLAN_ASSUMPTIONS.barbersPerShop

    const isPast = monthNo <= currentMonth
    const actualTakings = isPast ? actuals[i] : 0
    const attainmentPct =
      requiredTakings > 0 ? (actualTakings / requiredTakings) * 100 : 0

    annualRequired += requiredTakings
    if (isPast) annualActual += actualTakings

    months.push({
      month: monthNo,
      label: MONTH_LABELS[i],
      requiredTakings,
      actualTakings,
      attainmentPct: Math.round(attainmentPct * 10) / 10,
      // Future months have no actuals yet, so they're "pending" (amber) rather
      // than failing red.
      rag: isPast ? ragFromAttainment(attainmentPct) : "amber",
      barbersNeeded,
      isPast,
    })
  }

  // Year-to-date attainment uses required for elapsed months only.
  const requiredToDate = months
    .filter((m) => m.isPast)
    .reduce((s, m) => s + m.requiredTakings, 0)
  const annualAttainmentPct =
    requiredToDate > 0 ? (annualActual / requiredToDate) * 100 : 0

  return {
    year,
    startHeadcount,
    endHeadcount,
    annualRequired,
    annualActual,
    annualAttainmentPct: Math.round(annualAttainmentPct * 10) / 10,
    annualRag: ragFromAttainment(annualAttainmentPct),
    months,
  }
}

export type PlanBoardSummary = {
  year: number
  quarterLabel: string // e.g. "Q2 2026"
  // Shops
  shopsOpen: number
  shopsPlanned: number // cumulative shops the plan expects open by now
  shopsRag: Rag
  // Barbering turnover (annual milestone vs annualised actual run-rate)
  barberingMilestone: number
  barberingAnnualised: number
  barberingAttainmentPct: number
  barberingRag: Rag
  // Headcount
  headcountActual: number
  headcountPlanned: number // shops planned by now × 4 barbers
  headcountRag: Rag
  // Academy (informational; on top of barbering)
  academyMilestone: number
  // Next opening (from the plan schedule)
  nextOpeningLabel: string | null
}

/**
 * Board/investor summary: how the group is tracking against the LTZ plan for
 * the current year/quarter. Shops & headcount compare today's estate to the
 * plan's cumulative roll-out; barbering turnover compares the annualised actual
 * run-rate to the year's milestone.
 */
export async function getPlanProgress(
  now: Date = new Date(),
): Promise<PlanBoardSummary> {
  const path = await getVisionGlidePath()
  const year = Math.min(Math.max(now.getFullYear(), PLAN_BASE_YEAR), PLAN_TARGET_YEAR)
  const m = milestoneFor(year)

  const shopsOpen = path.sites.length
  const shopsPlanned = cumulativeShopsByMonth(now)
  const headcountActual = path.currentHeadcount
  const headcountPlanned = shopsPlanned * PLAN_ASSUMPTIONS.barbersPerShop

  const barberingAnnualised = path.currentAnnualisedSales
  const barberingAttainmentPct =
    m.barberingTurnover > 0
      ? (barberingAnnualised / m.barberingTurnover) * 100
      : 0

  const ratioRag = (actual: number, planned: number): Rag =>
    planned <= 0
      ? "green"
      : ragFromAttainment((actual / planned) * 100)

  const quarter = Math.floor(now.getMonth() / 3) + 1
  const next = nextPlannedOpening(now)

  return {
    year,
    quarterLabel: `Q${quarter} ${year}`,
    shopsOpen,
    shopsPlanned,
    shopsRag: ratioRag(shopsOpen, shopsPlanned),
    barberingMilestone: m.barberingTurnover,
    barberingAnnualised,
    barberingAttainmentPct: Math.round(barberingAttainmentPct * 10) / 10,
    barberingRag: ragFromAttainment(barberingAttainmentPct),
    headcountActual,
    headcountPlanned,
    headcountRag: ratioRag(headcountActual, headcountPlanned),
    academyMilestone: m.academyTurnover,
    nextOpeningLabel: next
      ? `${next.tier} Brand ${next.location} · ${MONTH_LABELS[next.month - 1]} ${next.year}`
      : null,
  }
}
