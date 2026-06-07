/**
 * Governance review cadence for Less Than Zero.
 *
 * The group runs a layered operating rhythm:
 *  - Weekly: site takings + KPI reporting, AI analysis (every Saturday).
 *  - Fortnightly: leadership review — Cosmin (COO) + Martin (CEO) work through
 *    the action/risk/decision registers and the AI recommendations.
 *  - Quarterly: strategy review against the LTZ 2025–2030 plan.
 *
 * All dates are anchored and computed here so the dashboard and a dedicated
 * cadence page can show "last / next" for each ceremony without any storage.
 */

export type Cadence = "weekly" | "fortnightly" | "quarterly"

export type ReviewCeremony = {
  key: Cadence
  title: string
  description: string
  owner: string
  /** ISO date (YYYY-MM-DD) of the most recent occurrence (today inclusive). */
  last: string
  /** ISO date (YYYY-MM-DD) of the next occurrence. */
  next: string
  /** Whether the ceremony is due today. */
  dueToday: boolean
  /** Days until the next occurrence (0 = today). */
  daysUntil: number
  agenda: string[]
}

// Fortnightly leadership review anchor: a known Saturday the cadence counts
// from. Reviews fall on this date and every 14 days thereafter.
const FORTNIGHT_ANCHOR = new Date(Date.UTC(2025, 0, 4)) // Sat 4 Jan 2025

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function londonToday(now = new Date()): Date {
  const london = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/London" }),
  )
  return new Date(Date.UTC(london.getFullYear(), london.getMonth(), london.getDate()))
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** Most recent Saturday (today inclusive) and the following Saturday. */
function weeklyDates(today: Date): { last: Date; next: Date; dueToday: boolean } {
  const day = today.getUTCDay() // 0 Sun ... 6 Sat
  const sinceSat = (day + 1) % 7 // days since the last Saturday
  const last = new Date(today)
  last.setUTCDate(today.getUTCDate() - sinceSat)
  const next = new Date(last)
  next.setUTCDate(last.getUTCDate() + 7)
  return { last, next, dueToday: day === 6 }
}

/** Most recent and next fortnightly leadership review dates. */
function fortnightlyDates(today: Date): {
  last: Date
  next: Date
  dueToday: boolean
} {
  const diff = daysBetween(FORTNIGHT_ANCHOR, today)
  const periods = Math.floor(diff / 14)
  const last = new Date(FORTNIGHT_ANCHOR)
  last.setUTCDate(FORTNIGHT_ANCHOR.getUTCDate() + periods * 14)
  const next = new Date(last)
  next.setUTCDate(last.getUTCDate() + 14)
  return { last, next, dueToday: daysBetween(last, today) === 0 }
}

/** Most recent and next quarterly strategy review (1 Jan/Apr/Jul/Oct). */
function quarterlyDates(today: Date): {
  last: Date
  next: Date
  dueToday: boolean
  label: string
} {
  const y = today.getUTCFullYear()
  const quarterStartMonths = [0, 3, 6, 9]
  const m = today.getUTCMonth()
  const currentQ = Math.floor(m / 3)
  const last = new Date(Date.UTC(y, quarterStartMonths[currentQ], 1))
  const nextQ = (currentQ + 1) % 4
  const nextYear = nextQ === 0 ? y + 1 : y
  const next = new Date(Date.UTC(nextYear, quarterStartMonths[nextQ], 1))
  const label = `Q${currentQ + 1} ${y}`
  return {
    last,
    next,
    dueToday: daysBetween(last, today) === 0,
    label,
  }
}

/** Build the full review cadence relative to "now" (UK time). */
export function getReviewCadence(now = new Date()): ReviewCeremony[] {
  const today = londonToday(now)

  const w = weeklyDates(today)
  const f = fortnightlyDates(today)
  const q = quarterlyDates(today)

  return [
    {
      key: "weekly",
      title: "Weekly performance reporting",
      description:
        "Every site reports takings and KPIs; the AI produces the week-on-week board analysis.",
      owner: "All site managers · COO",
      last: toISO(w.last),
      next: toISO(w.next),
      dueToday: w.dueToday,
      daysUntil: daysBetween(today, w.next),
      agenda: [
        "Confirm every site has submitted takings & KPIs",
        "Review the overall business RAG and area movements",
        "Read the AI week-on-week analysis",
        "Clear any red KPI with a logged action",
      ],
    },
    {
      key: "fortnightly",
      title: "Fortnightly leadership review",
      description:
        "Cosmin (COO) and Martin (CEO) work the action, risk and decision registers and the AI recommendations.",
      owner: "COO + CEO",
      last: toISO(f.last),
      next: toISO(f.next),
      dueToday: f.dueToday,
      daysUntil: daysBetween(today, f.next),
      agenda: [
        "Review all escalated and overdue actions",
        "Triage open risks and assign owners",
        "Run AI root-cause analysis and add recommended actions",
        "Log key decisions in the Decision Register",
      ],
    },
    {
      key: "quarterly",
      title: `Quarterly strategy review`,
      description:
        "Step back from the week-to-week and track progress against the LTZ 2025–2030 plan (turnover, shops, headcount).",
      owner: "CEO + Leadership team",
      last: toISO(q.last),
      next: toISO(q.next),
      dueToday: q.dueToday,
      daysUntil: daysBetween(today, q.next),
      agenda: [
        "Pace barbering turnover vs the annual milestone",
        "Review shops open vs the expansion plan",
        "Headcount & recruitment funnel health",
        "Academy income vs target",
        "Reset priorities for the coming quarter",
      ],
    },
  ]
}
