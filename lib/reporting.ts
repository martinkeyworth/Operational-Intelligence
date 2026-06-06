import "server-only"
import { generateText } from "ai"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { weeklyReports, user as userTable } from "@/lib/db/schema"
import {
  getBusinessScorecard,
  fmtWeekLong,
  type BusinessScorecard,
} from "@/lib/data"
import { COMPANY_DOMAIN } from "@/lib/access-types"

const MODEL = "openai/gpt-5.4-mini"

/** The Saturday (YYYY-MM-DD) for the current reporting week, in UK time. */
export function currentWeekEnding(now = new Date()): string {
  // Work in Europe/London local date.
  const london = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/London" }),
  )
  const day = london.getDay() // 0 Sun ... 6 Sat
  const diff = (6 - day + 7) % 7 // days until Saturday
  // If today is Saturday, use today; otherwise the most recent past Saturday.
  const sat = new Date(london)
  if (day === 6) {
    // keep today
  } else {
    sat.setDate(london.getDate() - ((day + 1) % 7))
  }
  void diff
  return sat.toISOString().slice(0, 10)
}

/** Previous Saturday for week-on-week comparison. */
export function previousWeekEnding(weekEnding: string): string {
  const d = new Date(weekEnding + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

/** Get-or-create the weekly_reports row for a week. */
export async function getOrCreateReport(weekEnding: string) {
  const [existing] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekEnding, weekEnding))
  if (existing) return existing
  const [created] = await db
    .insert(weeklyReports)
    .values({ weekEnding })
    .returning()
  return created
}

/** All registered company-domain users (for the all-hands report). */
export async function getCompanyRecipients(): Promise<
  { name: string; email: string }[]
> {
  const rows = await db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
  return rows.filter((r) => r.email.toLowerCase().endsWith(`@${COMPANY_DOMAIN}`))
}

function diffLabel(curr: number, prev: number | null): string {
  if (prev === null) return "new"
  if (curr > prev) return "improving"
  if (curr < prev) return "declining"
  return "static"
}

/** Build a compact, AI-ready comparison of this week vs last week. */
export async function buildComparison(weekEnding: string): Promise<{
  current: BusinessScorecard
  previous: BusinessScorecard | null
  rows: {
    area: string
    currPct: number
    prevPct: number | null
    currRag: string
    prevRag: string | null
    trend: string
  }[]
}> {
  const current = await getBusinessScorecard(weekEnding)
  let previous: BusinessScorecard | null = null
  try {
    previous = await getBusinessScorecard(previousWeekEnding(weekEnding))
  } catch {
    previous = null
  }

  const rows = current.areas.map((a) => {
    const prev = previous?.areas.find((p) => p.key === a.key) ?? null
    return {
      area: a.label,
      currPct: a.pct,
      prevPct: prev?.pct ?? null,
      currRag: a.rag,
      prevRag: prev?.rag ?? null,
      trend: diffLabel(a.pct, prev?.pct ?? null),
    }
  })

  return { current, previous, rows }
}

/**
 * Run the AI week-on-week analysis for a week, persist it on the report row,
 * and return the analysis text + snapshot. Runs against the full scorecard.
 */
export async function runWeeklyAnalysis(weekEnding: string): Promise<{
  analysis: string
  scorecard: BusinessScorecard
}> {
  await getOrCreateReport(weekEnding)
  const { current, previous, rows } = await buildComparison(weekEnding)

  const tableLines = rows
    .map(
      (r) =>
        `- ${r.area}: ${r.currPct}% (${r.currRag})` +
        (r.prevPct === null
          ? " — no prior week"
          : ` vs ${r.prevPct}% (${r.prevRag}) last week → ${r.trend}`),
    )
    .join("\n")

  const prompt = `You are the group performance analyst for Less Than Zero, a barbershop group.
Analyse this week's KPI performance week-on-week. The overall business RAG is ${current.overallRag.toUpperCase()} at ${current.overallPct}% (last week: ${
    previous ? `${previous.overallRag.toUpperCase()} ${previous.overallPct}%` : "n/a"
  }).

Area scores (this week vs last week):
${tableLines}

Write a concise board-ready analysis with three clearly headed sections:
1. Improving — areas getting better, with the % movement.
2. Static — areas holding steady.
3. Declining — areas getting worse, with the % movement and the likely operational impact.
End with a one-line bottom line. Be specific, use the numbers, no fluff, max ~220 words.`

  let analysis = ""
  try {
    const res = await generateText({ model: MODEL, prompt })
    analysis = res.text.trim()
  } catch (e) {
    analysis =
      "AI analysis could not be generated this week (" +
      (e instanceof Error ? e.message : "unknown error") +
      "). Area movements: \n" +
      tableLines
  }

  await db
    .update(weeklyReports)
    .set({
      overallRag: current.overallRag,
      overallPct: current.overallPct,
      snapshot: JSON.stringify(current),
      aiAnalysis: analysis,
      analysisRunAt: new Date(),
    })
    .where(eq(weeklyReports.weekEnding, weekEnding))

  return { analysis, scorecard: current }
}

/** AI review of the full narrative chain (analysis + Cosmin + Martin). */
export async function reviewNarrative(weekEnding: string): Promise<string> {
  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekEnding, weekEnding))
  if (!report) return ""

  const parts = [
    `AI analysis:\n${report.aiAnalysis ?? "(none)"}`,
    `Cosmin (COO) narrative:\n${report.cosminNarrative ?? "(not supplied)"}`,
    `Martin (CEO) response:\n${report.martinResponse ?? "(not supplied)"}`,
  ].join("\n\n")

  const prompt = `You are summarising the leadership commentary for Less Than Zero's weekly board report (week ending ${fmtWeekLong(
    weekEnding,
  )}). Overall business RAG: ${report.overallRag?.toUpperCase() ?? "?"} (${
    report.overallPct ?? "?"
  }%).

Source material:
${parts}

Produce a single cohesive executive review (max ~180 words) that blends the data-driven analysis with the leadership narrative into one clear voice for the whole team. If a narrative is missing, note it briefly and proceed. End with the top 2-3 priorities for the week ahead.`

  try {
    const res = await generateText({ model: MODEL, prompt })
    return res.text.trim()
  } catch {
    return report.aiAnalysis ?? ""
  }
}
