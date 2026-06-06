import { ragFromAttainment, type Rag } from "@/lib/format"

/**
 * Growth glidepath toward the 2030 north-star.
 *
 * The board's stated goal: £5m overall annual sales revenue by 2030, with
 * RTB (rent-to-business) at 50% = £2.5m. We are in 2026 and in deliberate
 * high-growth mode, so targets are NOT a flat £5m today — they ramp each year
 * along a compound (geometric) curve from the 2026 baseline up to £5m in 2030.
 *
 * Everything else (per-site targets, per-barber weekly RTB) is worked back
 * from this single number so the whole ecosystem links up.
 */
export const NORTH_STAR_YEAR = 2030
export const NORTH_STAR_SALES = 5_000_000
/** RTB is targeted at 50% of sales. */
export const RTB_RATIO = 0.5
export const NORTH_STAR_RTB = NORTH_STAR_SALES * RTB_RATIO // £2.5m

/** First year of the journey and its annual sales baseline (annualised from
 *  the 2026 run-rate). Editable as the business re-baselines. */
export const BASELINE_YEAR = 2026
export const BASELINE_SALES = 500_000

/** Compound annual growth rate required to reach the north-star from the
 *  baseline. (5,000,000 / 500,000) ^ (1 / (2030 - 2026)). */
export const TARGET_CAGR =
  Math.pow(NORTH_STAR_SALES / BASELINE_SALES, 1 / (NORTH_STAR_YEAR - BASELINE_YEAR)) - 1

/** Annual sales target for a given calendar year along the glidepath. */
export function annualSalesTarget(year: number): number {
  if (year <= BASELINE_YEAR) return BASELINE_SALES
  if (year >= NORTH_STAR_YEAR) return NORTH_STAR_SALES
  return Math.round(BASELINE_SALES * Math.pow(1 + TARGET_CAGR, year - BASELINE_YEAR))
}

/** Annual RTB target (50% of sales) for a given year. */
export function annualRtbTarget(year: number): number {
  return Math.round(annualSalesTarget(year) * RTB_RATIO)
}

/** Group-wide weekly sales / RTB targets for the year (annual / 52). */
export function weeklySalesTarget(year: number): number {
  return Math.round(annualSalesTarget(year) / 52)
}
export function weeklyRtbTarget(year: number): number {
  return Math.round(annualRtbTarget(year) / 52)
}

/** The full year-by-year trajectory, useful for plotting. */
export function trajectory(): {
  year: number
  sales: number
  rtb: number
}[] {
  const out: { year: number; sales: number; rtb: number }[] = []
  for (let y = BASELINE_YEAR; y <= NORTH_STAR_YEAR; y++) {
    out.push({ year: y, sales: annualSalesTarget(y), rtb: annualRtbTarget(y) })
  }
  return out
}

/**
 * Allocate a group target to a single site by its share of total chair
 * capacity. Bigger sites carry proportionally more of the number.
 */
export function siteShare(siteChairs: number, totalChairs: number): number {
  if (totalChairs <= 0) return 0
  return siteChairs / totalChairs
}

export function siteAnnualSalesTarget(
  year: number,
  siteChairs: number,
  totalChairs: number,
): number {
  return Math.round(annualSalesTarget(year) * siteShare(siteChairs, totalChairs))
}

export function siteAnnualRtbTarget(
  year: number,
  siteChairs: number,
  totalChairs: number,
): number {
  return Math.round(annualRtbTarget(year) * siteShare(siteChairs, totalChairs))
}

/**
 * Per-barber weekly RTB target, worked back from the glidepath:
 * site annual RTB target / chairs / 52 weeks. This is what each chair must
 * bill in rent to keep the business on the 2030 trajectory.
 */
export function perBarberWeeklyRtbTarget(
  year: number,
  siteChairs: number,
  totalChairs: number,
): number {
  if (siteChairs <= 0) return 0
  return Math.round(siteAnnualRtbTarget(year, siteChairs, totalChairs) / siteChairs / 52)
}

/** RAG for progress against a glidepath target (reuses the shared banding:
 *  green at/above target, amber within 10%, red below). */
export function ragForTargetProgress(actual: number, target: number): Rag {
  if (target <= 0) return "green"
  return ragFromAttainment((actual / target) * 100)
}

/** Current year helper (kept here so targets stay consistent app-wide). */
export function currentTargetYear(): number {
  return new Date().getFullYear()
}
