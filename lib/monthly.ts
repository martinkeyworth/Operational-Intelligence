import "server-only"
import { getGroupTrend, getBusinessScorecard, getLatestWeek } from "@/lib/data"
import { barberingTargetForMonth } from "@/lib/plan"
import { ragFromAttainment, type Rag } from "@/lib/format"
import { nextPlannedOpening, OPENING_SCHEDULE } from "@/lib/plan"

// ---------------------------------------------------------------------------
// Monthly roll-up — the missing middle layer between the weekly inputs and the
// quarterly board summary. Weekly takings (chair + sublet + training) are
// grouped into calendar months by week-ending date, then compared against the
// plan's barbering turnover target for that month.
// ---------------------------------------------------------------------------

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export type MonthlyRow = {
  key: string // YYYY-MM
  label: string // e.g. "March 2026"
  year: number
  month: number // 1-12
  weeks: number
  revenue: number
  // Plan barbering target for the month (annual milestone / 12 interpolation).
  planTarget: number
  attainmentPct: number
  rag: Rag
  openings: string[] // planned openings in this month
}

export type MonthlySummary = {
  rows: MonthlyRow[]
  latestWeek: string | null
}

/** Build the monthly roll-up across all weeks with data. */
export async function getMonthlyRollup(): Promise<MonthlySummary> {
  const [trend, latestWeek] = await Promise.all([
    getGroupTrend(),
    getLatestWeek(),
  ])

  const byMonth = new Map<
    string,
    { revenue: number; weeks: number; year: number; month: number }
  >()

  for (const pt of trend) {
    const d = new Date(pt.week + "T00:00:00")
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, "0")}`
    const cur = byMonth.get(key) ?? { revenue: 0, weeks: 0, year, month }
    cur.revenue += pt.revenue
    cur.weeks += 1
    byMonth.set(key, cur)
  }

  const rows: MonthlyRow[] = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
    .map(([key, v]) => {
      // Plan barbering target is annual; pro-rate to the month.
      const planTarget = Math.round(barberingTargetForMonth(v.year, v.month) / 12)
      const attainmentPct =
        planTarget > 0 ? Math.round((v.revenue / planTarget) * 1000) / 10 : 0
      const openings = OPENING_SCHEDULE.filter(
        (o) => o.year === v.year && o.month === v.month,
      ).map((o) => `${o.tier} Brand · ${o.location}`)
      return {
        key,
        label: `${MONTH_LABELS[v.month - 1]} ${v.year}`,
        year: v.year,
        month: v.month,
        weeks: v.weeks,
        revenue: Math.round(v.revenue),
        planTarget,
        attainmentPct,
        rag: ragFromAttainment(attainmentPct),
        openings,
      }
    })

  return { rows, latestWeek }
}

/** Scorecard area RAGs for the latest week (reused on the monthly page). */
export async function getLatestAreaRags() {
  const week = await getLatestWeek()
  if (!week) return null
  const scorecard = await getBusinessScorecard(week)
  const next = nextPlannedOpening()
  return { week, scorecard, nextOpening: next }
}
