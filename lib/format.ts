// Client-safe helpers and types. No server-only / database imports here.

export type Rag = "green" | "amber" | "red"

const RAG_ORDER: Record<Rag, number> = { red: 0, amber: 1, green: 2 }

/** Worst (most severe) RAG wins when rolling up. */
export function rollUpRag(values: Rag[]): Rag {
  if (values.length === 0) return "green"
  return values.reduce((worst, v) => (RAG_ORDER[v] < RAG_ORDER[worst] ? v : worst))
}

/** RAG from attainment percentage against target.
 *  Green only when target is achieved or surpassed (>= 100%).
 *  Amber when within 10% under target (90% - 99%).
 *  Red when more than 10% under target (< 90%). */
export function ragFromAttainment(pct: number): Rag {
  if (pct >= 100) return "green"
  if (pct >= 90) return "amber"
  return "red"
}

export function fmtGBP(n: number, opts: { decimals?: boolean } = {}): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(n)
}

/** Format an ISO date (yyyy-mm-dd) as e.g. "24 Jan". */
export function fmtWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

export function fmtWeekLong(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

/** Format an ISO date (yyyy-mm-dd, optionally with time) as e.g. "24 Jan 2026". */
export function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Reporting week + submission deadline
// ---------------------------------------------------------------------------
// Submissions run Saturday-to-Saturday and are due by 18:00 (Europe/London) on
// the week-ending Saturday. The "current" reporting week is therefore the
// UPCOMING Saturday — e.g. on Wed 10 Jun the live week ends Sat 13 Jun. A
// submission only becomes "outstanding" once that Saturday 6pm deadline has
// passed; before then a missing entry is simply still awaited, not overdue.

const SUBMISSION_DEADLINE_HOUR = 18 // 6pm

/** Build a yyyy-mm-dd string from a Date's local (London wall-clock) parts. */
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Now, expressed as a Date carrying Europe/London wall-clock components. */
function londonNow(now: Date): Date {
  return new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }))
}

/** Today's date (yyyy-mm-dd) in UK wall-clock time. */
export function todayIso(now: Date = new Date()): string {
  return toISODate(londonNow(now))
}

/** The Saturday (yyyy-mm-dd) ending the current reporting week, in UK time.
 *  Returns the UPCOMING Saturday (today, if today is Saturday). */
export function currentWeekEnding(now: Date = new Date()): string {
  const london = londonNow(now)
  const day = london.getDay() // 0 Sun ... 6 Sat
  const daysUntilSat = (6 - day + 7) % 7 // 0 when today is Saturday
  const sat = new Date(london)
  sat.setDate(london.getDate() + daysUntilSat)
  return toISODate(sat)
}

/** Map any calendar date (yyyy-mm-dd) to the Saturday that ENDS its reporting
 *  week (that Saturday itself, or the next Saturday). Used to roll daily
 *  takings up into the correct week_ending bucket. */
export function weekEndingFor(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00")
  const day = d.getDay() // 0 Sun ... 6 Sat
  const daysUntilSat = (6 - day + 7) % 7
  d.setDate(d.getDate() + daysUntilSat)
  return toISODate(d)
}

/** The seven yyyy-mm-dd dates (Sun→Sat) of the week ending on `weekEnding`. */
export function weekDates(weekEnding: string): string[] {
  const sat = new Date(weekEnding + "T00:00:00")
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sat)
    d.setDate(sat.getDate() - (6 - i))
    return toISODate(d)
  })
}

/** Whether the 18:00 Saturday submission deadline for a week has passed. */
export function isPastSubmissionDeadline(
  weekEnding: string,
  now: Date = new Date(),
): boolean {
  const [y, m, d] = weekEnding.split("-").map(Number)
  // Deadline and "now" are both built as Dates representing London wall-clock,
  // so a direct time comparison is valid.
  const deadline = new Date(y, m - 1, d, SUBMISSION_DEADLINE_HOUR, 0, 0, 0)
  return londonNow(now).getTime() >= deadline.getTime()
}
