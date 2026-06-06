// Client-safe helpers and types. No server-only / database imports here.

export type Rag = "green" | "amber" | "red"

const RAG_ORDER: Record<Rag, number> = { red: 0, amber: 1, green: 2 }

/** Worst (most severe) RAG wins when rolling up. */
export function rollUpRag(values: Rag[]): Rag {
  if (values.length === 0) return "green"
  return values.reduce((worst, v) => (RAG_ORDER[v] < RAG_ORDER[worst] ? v : worst))
}

/** RAG from attainment percentage against target. */
export function ragFromAttainment(pct: number): Rag {
  if (pct >= 95) return "green"
  if (pct >= 80) return "amber"
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
