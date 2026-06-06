import { db } from "@/lib/db"
import { sites as sitesTable, weeklyTakings } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

/**
 * Long-term vision: £5m overall annual chair-sales revenue by 2030, with RTB
 * (rent-to-business) at a 50% SITE yield = £2.5m. The 50% is the site's yield
 * on chair takings, not an individual barber's personal split.
 *
 * The key driver is HEADCOUNT, not per-barber revenue. RTB is assumed at a
 * fixed £500 per barber per week, which at the 50% site yield implies ~£1,000
 * gross chair takings per barber per week. The £2.5m RTB goal therefore backs
 * out the number of barbers we need on the floor by 2030 — roughly 100
 * barbers. This file models the headcount glide path from today up to that
 * 2030 target. Training and subletting income sit on top as the "fat" and are
 * excluded from the £5m.
 */
export const VISION = {
  targetYear: 2030,
  baseYear: 2026,
  salesGoal: 5_000_000,
  rtbRatio: 0.5, // 50% site yield => £2.5m RTB
  rtbPerBarberWeekly: 500, // fixed RTB contribution per barber per week
  weeksPerYear: 52,
} as const

export type VisionYear = {
  year: number
  headcountTarget: number
  salesTarget: number
  rtbTarget: number
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
 * Build the headcount-driven vision glide path: the number of barbers required
 * by 2030 to reach £2.5m RTB at £500/barber/week, the per-year headcount
 * milestones, and the per-site breakdown.
 */
export async function getVisionGlidePath(): Promise<VisionGlidePath> {
  const salesGoal = VISION.salesGoal
  const rtbGoal = Math.round(salesGoal * VISION.rtbRatio)

  const rtbPerBarberAnnual = VISION.rtbPerBarberWeekly * VISION.weeksPerYear // £26,000
  const grossPerBarberWeekly = Math.round(
    VISION.rtbPerBarberWeekly / VISION.rtbRatio,
  ) // ~£1,000

  // Headcount required by 2030 = £2.5m RTB / £26k RTB per barber/year.
  const barbersNeeded = Math.ceil(rtbGoal / rtbPerBarberAnnual)

  // Current total barbershop headcount anchors the start of the glide path.
  const [hc] = await db
    .select({
      headcount: sitesTable.headcount,
      chairs: sitesTable.chairCapacity,
      siteType: sitesTable.siteType,
    })
    .from(sitesTable)
    .where(eq(sitesTable.siteType, "barbershop"))
    .limit(1)
  void hc // (typing guard; aggregate below)

  const barbershops = await db
    .select({
      id: sitesTable.id,
      name: sitesTable.name,
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
  const span = VISION.targetYear - VISION.baseYear // 4 years

  // Compound growth in HEADCOUNT from today to the barbers we need by 2030.
  const startHc = Math.max(currentHeadcount, 1)
  const headcountCagr =
    barbersNeeded > 0 && span > 0
      ? Math.pow(barbersNeeded / startHc, 1 / span) - 1
      : 0

  const years: VisionYear[] = []
  for (let i = 0; i <= span; i++) {
    const year = VISION.baseYear + i
    const isGoal = year === VISION.targetYear
    const headcountTarget = isGoal
      ? barbersNeeded
      : Math.round(startHc * Math.pow(1 + headcountCagr, i))
    const rtbTarget = headcountTarget * rtbPerBarberAnnual
    const salesTarget = Math.round(rtbTarget / VISION.rtbRatio)
    years.push({ year, headcountTarget, salesTarget, rtbTarget, isGoal })
  }

  // Allocate the 2030 headcount across sites by chair capacity (indicative;
  // hitting ~100 barbers will require growing chairs/sites too).
  const sites: VisionSite[] = barbershops.map((b) => {
    const chairs = b.chairs ?? 0
    const share = totalChairs > 0 ? chairs / totalChairs : 0
    const headcountTarget = Math.round(barbersNeeded * share)
    const rtbTarget = headcountTarget * rtbPerBarberAnnual
    const salesTarget = Math.round(rtbTarget / VISION.rtbRatio)
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
    rtbPerBarberWeekly: VISION.rtbPerBarberWeekly,
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
