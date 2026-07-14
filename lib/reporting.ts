import "server-only"
import { generateText, generateObject } from "ai"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { weeklyReports, user as userTable } from "@/lib/db/schema"
import {
  getBusinessScorecard,
  fmtWeekLong,
  fmtGBP,
  currentWeekEnding,
  type BusinessScorecard,
} from "@/lib/data"
import { getPlanProgress } from "@/lib/vision"
import { COMPANY_DOMAIN } from "@/lib/access-types"

const MODEL = "openai/gpt-5.4-mini"

/** Public base URL for links in emails. */
export function appBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL || "")
  )
}

/** The Saturday (YYYY-MM-DD) for the current reporting week, in UK time.
 *  Re-exported from the canonical helper so existing imports keep working. */
export { currentWeekEnding }

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

/**
 * Every registered user, regardless of email domain. Used for the Saturday
 * 17:00 "update your section" reminder so external collaborators are nudged
 * too — not just @COMPANY_DOMAIN accounts.
 */
export async function getAllRecipients(): Promise<
  { name: string; email: string }[]
> {
  return db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
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

  // Pull plan-progress context so the board report tracks vs the LTZ
  // 2025–2030 milestones (turnover, shops, headcount), not just week-on-week.
  let planLines = ""
  try {
    const plan = await getPlanProgress(new Date(weekEnding + "T00:00:00Z"))
    planLines = `Plan tracking (${plan.quarterLabel}, vs LTZ 2025–2030 plan):
- Chair turnover (barbering + Velvet Ash): ${fmtGBP(plan.chairAnnualised)} annualised = ${plan.chairAttainmentPct}% of the ${fmtGBP(plan.chairMilestone)} ${plan.year} milestone (${plan.chairRag}).
- Shops open: ${plan.shopsOpen} vs ${plan.shopsPlanned} planned by now (${plan.shopsRag}).
- Headcount: ${plan.headcountActual} barbers vs ${plan.headcountPlanned} planned (4/shop) (${plan.headcountRag}).
- Academy income target ${plan.year}: ${fmtGBP(plan.academyMilestone)}. Total group revenue target: ${fmtGBP(plan.totalMilestone)} (£5m goal incl. all streams).${
      plan.nextOpeningLabel ? `\n- Next planned opening: ${plan.nextOpeningLabel}.` : ""
    }`
  } catch {
    planLines = ""
  }

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
${planLines ? `\n${planLines}\n` : ""}
Write a concise board-ready analysis with these clearly headed sections:
1. Improving — areas getting better, with the % movement.
2. Static — areas holding steady.
3. Declining — areas getting worse, with the % movement and the likely operational impact.
4. Plan tracking — how the group is pacing against the LTZ 2025–2030 milestones (turnover, shops, headcount) and any opening due soon.
End with a one-line bottom line. Be specific, use the numbers, no fluff, max ~260 words.`

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

/**
 * Final AI "wrap-around" synthesis for the event-driven cadence. Runs only once
 * the AI analysis + COO narrative + CEO response all exist, and folds them into
 * the definitive executive review that leads the consolidated board report.
 *
 * Unlike `reviewNarrative`, this returns `null` on AI failure (NO silent
 * fallback) so the orchestrator can wait and retry on the next tick rather than
 * sending a half-baked report.
 */
export async function synthesiseFinalReview(
  weekEnding: string,
): Promise<string | null> {
  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekEnding, weekEnding))
  if (!report) return null

  const prompt = `You are writing the definitive executive review that leads Less Than Zero's weekly board report to the whole company (week ending ${fmtWeekLong(
    weekEnding,
  )}). Overall business RAG: ${report.overallRag?.toUpperCase() ?? "?"} (${
    report.overallPct ?? "?"
  }%).

Fold these three inputs into ONE cohesive, decisive board-level narrative:

AI week-on-week analysis:
${report.aiAnalysis ?? "(none)"}

COO narrative (Cosmin):
${report.cosminNarrative ?? "(none)"}

CEO response (Martin):
${report.martinResponse ?? "(none)"}

Write ~200 words in one confident leadership voice for the whole team: what happened this week, why, what leadership has decided, and the top 2-3 priorities for the week ahead. Do not label the sections or attribute quotes; speak as the leadership team.`

  try {
    const res = await generateText({ model: MODEL, prompt })
    const text = res.text.trim()
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// AI root-cause analysis + recommended actions
// ---------------------------------------------------------------------------

export type RecommendedAction = {
  functionArea: string
  title: string
  rationale: string
  priority: "High" | "Medium" | "Low"
  owner: string
}

export type RootCauseAnalysis = {
  summary: string
  rootCauses: { area: string; cause: string; evidence: string }[]
  recommendedActions: RecommendedAction[]
}

const rootCauseSchema = z.object({
  summary: z
    .string()
    .describe("One or two sentences naming the biggest drivers of underperformance this week."),
  rootCauses: z
    .array(
      z.object({
        area: z.string().describe("The functional area, e.g. Marketing, HR, RTB."),
        cause: z.string().describe("The most likely underlying root cause, not just the symptom."),
        evidence: z.string().describe("The specific number/trend from the data that supports this."),
      }),
    )
    .describe("2 to 4 root causes for the worst-performing areas."),
  recommendedActions: z
    .array(
      z.object({
        functionArea: z.string().describe("Functional area the action belongs to."),
        title: z.string().describe("A concrete, specific action (imperative, max ~12 words)."),
        rationale: z.string().describe("Why this action addresses the root cause."),
        priority: z.enum(["High", "Medium", "Low"]),
        owner: z.string().describe("The role best placed to own it, e.g. COO, Social Media, Training Lead."),
      }),
    )
    .describe("3 to 5 recommended actions, highest priority first."),
})

/**
 * Run a structured root-cause analysis for a week. Produces likely root causes
 * for the worst-performing areas plus concrete recommended actions that can be
 * pushed straight into the action register. Falls back to an empty result if
 * the model call fails.
 */
export async function runRootCauseAnalysis(
  weekEnding: string,
): Promise<RootCauseAnalysis> {
  const { current, rows } = await buildComparison(weekEnding)

  const tableLines = rows
    .map(
      (r) =>
        `- ${r.area}: ${r.currPct}% (${r.currRag})` +
        (r.prevPct === null
          ? ""
          : ` vs ${r.prevPct}% last week → ${r.trend}`),
    )
    .join("\n")

  const prompt = `You are the group operations analyst for Less Than Zero, a barbershop group.
Overall business RAG this week: ${current.overallRag.toUpperCase()} at ${current.overallPct}%.

Area scores (this week vs last week):
${tableLines}

Diagnose the WORST-performing / declining areas. For each, identify the most likely ROOT CAUSE (the underlying driver, not just the symptom) backed by the specific number. Then propose concrete, specific recommended actions a leadership team could assign this week to fix them. Prefer high-leverage actions. Owners should be roles (COO, Social Media, Training Lead, Finance, Operations).`

  const empty: RootCauseAnalysis = {
    summary: "",
    rootCauses: [],
    recommendedActions: [],
  }

  try {
    const { object } = await generateObject({
      model: MODEL,
      schema: rootCauseSchema,
      prompt,
    })
    return object as RootCauseAnalysis
  } catch {
    return empty
  }
}
