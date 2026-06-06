import { db } from "@/lib/db"
import { sites as sitesTable, weeklyTakings } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

/**
 * Long-term vision: £5m overall annual sales revenue by 2030, with RTB
 * (rent-to-business) at 50% = £2.5m. We are in 2026 in steep growth, so this
 * models a compound glide path from the current annualised run-rate up to the
 * 2030 goal, then cascades the per-year sales/RTB target down to each site (by
 * chair capacity) and to each barber's weekly RTB.
 */
export const VISION = {
  targetYear: 2030,
  baseYear: 2026,
  salesGoal: 5_000_000,
  rtbRatio: 0.5, // RTB is 50% of sales => £2.5m
} as const

export type VisionYear = {
  year: number
  salesTarget: number
  rtbTarget: number
  isGoal: boolean
}

export type VisionSite = {
  siteId: number
  name: string
  chairs: number
  salesTarget: number // 2030 site sales target
  rtbTarget: number // 2030 site RTB target
  rtbPerBarberWeekly: number // 2030 per-chair weekly RTB target
}

export type VisionGlidePath = {
  salesGoal: number
  rtbGoal: number
  baseYear: number
  targetYear: number
  currentAnnualisedSales: number
  cagrPct: number // implied annual growth rate to hit the goal
  years: VisionYear[]
  sites: VisionSite[]
  totalChairs: number
}

/** Annualise the trailing weeks of takings to anchor the glide path start. */
async function currentAnnualisedSales(): Promise<number> {
  const rows = await db
    .select({ weekEnding: weeklyTakings.weekEnding, total: weeklyTakings.total })
    .from(weeklyTakings)
    .orderBy(desc(weeklyTakings.weekEnding))
    .limit(56)

  // Group to weekly totals, take the most recent up-to-8 weeks.
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
  return Math.round(avgWeek * 52)
}

/**
 * Build the full vision glide path: per-year sales/RTB targets and the per-site
 * / per-barber breakdown for the 2030 goal.
 */
export async function getVisionGlidePath(): Promise<VisionGlidePath> {
  const salesGoal = VISION.salesGoal
  const rtbGoal = Math.round(salesGoal * VISION.rtbRatio)

  const baseSales = await currentAnnualisedSales()
  const span = VISION.targetYear - VISION.baseYear // 4 years

  // Implied compound annual growth rate from current run-rate to the goal.
  const cagr =
    baseSales > 0 && span > 0
      ? Math.pow(salesGoal / baseSales, 1 / span) - 1
      : 0

  const years: VisionYear[] = []
  for (let i = 0; i <= span; i++) {
    const year = VISION.baseYear + i
    const isGoal = year === VISION.targetYear
    // Last year is pinned exactly to the goal to avoid rounding drift.
    const salesTarget = isGoal
      ? salesGoal
      : Math.round(baseSales * Math.pow(1 + cagr, i))
    years.push({
      year,
      salesTarget,
      rtbTarget: Math.round(salesTarget * VISION.rtbRatio),
      isGoal,
    })
  }

  // Allocate the 2030 goal across barbershop sites by chair capacity.
  const barbershops = await db
    .select({
      id: sitesTable.id,
      name: sitesTable.name,
      chairs: sitesTable.chairCapacity,
    })
    .from(sitesTable)
    .where(eq(sitesTable.siteType, "barbershop"))
    .orderBy(sitesTable.name)

  const totalChairs = barbershops.reduce((s, b) => s + (b.chairs ?? 0), 0)

  const sites: VisionSite[] = barbershops.map((b) => {
    const chairs = b.chairs ?? 0
    const share = totalChairs > 0 ? chairs / totalChairs : 0
    const siteSales = Math.round(salesGoal * share)
    const siteRtb = Math.round(siteSales * VISION.rtbRatio)
    const perBarberWeekly =
      chairs > 0 ? Math.round(siteRtb / chairs / 52) : 0
    return {
      siteId: b.id,
      name: b.name,
      chairs,
      salesTarget: siteSales,
      rtbTarget: siteRtb,
      rtbPerBarberWeekly: perBarberWeekly,
    }
  })

  return {
    salesGoal,
    rtbGoal,
    baseYear: VISION.baseYear,
    targetYear: VISION.targetYear,
    currentAnnualisedSales: baseSales,
    cagrPct: Math.round(cagr * 1000) / 10,
    years,
    sites,
    totalChairs,
  }
}
