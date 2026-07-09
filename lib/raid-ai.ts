import "server-only"
import { generateText, Output } from "ai"
import { z } from "zod"
import type { ActionRow } from "@/lib/data"
import { findFunctionArea } from "@/lib/function-areas"

// gpt-5.4-mini via the Vercel AI Gateway (zero-config), matching lib/pbc-ai.ts.
const RAID_MODEL = "openai/gpt-5.4-mini"

export type ProposedAction = {
  title: string
  description: string
  owner: string
  dueInDays: number
  priority: "High" | "Medium" | "Low"
}

export type RaidAreaAnalysis = {
  area: string
  areaLabel: string
  // True when the AI judges there is a systemic ("dismal") problem that people
  // can see but haven't got to the root of, or don't know how to execute on.
  systemic: boolean
  headline: string
  // What the data shows (the visible symptom).
  situation: string
  // The AI "strategic coach" root-cause analysis.
  rootCause: string
  // Coaching: how to think about and execute the fix.
  coaching: string
  proposedActions: ProposedAction[]
  model: string
}

const analysisSchema = z.object({
  systemic: z
    .boolean()
    .describe(
      "True if there is a systemic/root problem in this area that the team can see but has not resolved (repeated red/overdue items, recurring theme, stalled progress). False if the register is healthy or only has isolated, well-managed items.",
    ),
  headline: z.string().describe("A short (max 10 word) headline naming the core problem."),
  situation: z
    .string()
    .describe("2-3 sentences: what the RAID data visibly shows (the symptoms), citing specific items."),
  rootCause: z
    .string()
    .describe(
      "3-5 sentences of genuine root-cause analysis — the underlying WHY behind the symptoms, not a restatement of them. Think like a strategic coach.",
    ),
  coaching: z
    .string()
    .describe(
      "2-4 sentences coaching the owner on HOW to think about and execute the fix, since they understand the issue but not the root cause or how to act.",
    ),
  proposedActions: z
    .array(
      z.object({
        title: z.string().describe("Short imperative action title."),
        description: z.string().describe("1-2 sentences on what to do and the outcome it drives."),
        owner: z.string().describe("The role or person best placed to own this."),
        dueInDays: z.number().int().min(3).max(90).describe("Days from today this should be resolved by."),
        priority: z.enum(["High", "Medium", "Low"]),
      }),
    )
    .min(1)
    .max(4)
    .describe("A draft resolution plan: 1-4 concrete actions with clear owners and due dates."),
})

function describeEntry(a: ActionRow): string {
  const bits = [
    `[${a.entryType}] "${a.title}"`,
    `rag=${a.rag}`,
    `status=${a.status}`,
    `priority=${a.priority}`,
    a.owner ? `owner=${a.ownerLabel}` : "owner=Unassigned",
    a.dueDate ? `due=${a.dueDate}` : "no-due-date",
    a.overdue ? `OVERDUE by ${a.daysOverdue}d` : "",
    a.escalated ? `ESCALATED${a.escalationReason ? ` (${a.escalationReason})` : ""}` : "",
  ].filter(Boolean)
  const desc = a.description ? ` — ${a.description}` : ""
  return `- ${bits.join(", ")}${desc}`
}

/**
 * The AI "strategic coach". Given one functional area and its open RAID
 * entries (plus an optional current-performance signal), it decides whether
 * there is a systemic issue, performs a root-cause analysis, coaches the owner
 * on execution, and drafts a resolution plan with owners and due dates.
 *
 * Never throws: on any failure it returns a non-systemic result so the weekly
 * workflow email step can't be broken by a model hiccup.
 */
export async function analyseAreaRaid(input: {
  area: string
  entries: ActionRow[]
  performanceNote?: string | null
}): Promise<RaidAreaAnalysis> {
  const def = findFunctionArea(input.area)
  const areaLabel = def?.label ?? input.area
  const open = input.entries.filter((e) => e.status !== "Closed")

  const base: RaidAreaAnalysis = {
    area: input.area,
    areaLabel,
    systemic: false,
    headline: "",
    situation: "",
    rootCause: "",
    coaching: "",
    proposedActions: [],
    model: RAID_MODEL,
  }

  // Nothing open to analyse — not systemic, no email.
  if (open.length === 0) return base

  const register = open.map(describeEntry).join("\n")
  const redCount = open.filter((e) => e.rag === "red").length
  const overdueCount = open.filter((e) => e.overdue).length

  const prompt = `You are a seasoned strategic operations coach for Less Than Zero Barbers, a multi-site barbershop group. You are reviewing the RAID log (Risks, Issues, Actions, Decisions) for ONE functional area and giving its accountable owner honest, practical guidance.

Functional area: ${areaLabel}
Area remit: ${def?.description ?? "(see title)"}
Open RAID entries: ${open.length} (of which ${redCount} red, ${overdueCount} overdue)
${input.performanceNote ? `Current performance signal: ${input.performanceNote}` : ""}

RAID register (open entries):
${register}

Your job: decide whether this area has a SYSTEMIC problem — the kind of "dismal" issue where the team can SEE something is wrong but hasn't understood the ROOT CAUSE or how to EXECUTE a fix. Signals of systemic problems include: several red or overdue items, a recurring theme across entries, items that have escalated, or progress that has stalled. A handful of well-managed, on-track items is NOT systemic.

If it is systemic, act as a strategic coach: name the core problem, describe the visible situation, then dig beneath the symptoms to the genuine ROOT CAUSE (the underlying "why"), COACH the owner on how to think about and execute the fix, and draft a concrete resolution plan of 1-4 actions, each with a sensible owner and a realistic due date (in days from today). Be specific and reference the actual entries. If it is NOT systemic, set systemic=false and keep the narrative brief, but still return at least one small tidy-up action.`

  try {
    const { experimental_output } = await generateText({
      model: RAID_MODEL,
      experimental_output: Output.object({ schema: analysisSchema }),
      prompt,
    })
    const out = experimental_output
    return {
      ...base,
      systemic: Boolean(out.systemic),
      headline: out.headline,
      situation: out.situation,
      rootCause: out.rootCause,
      coaching: out.coaching,
      proposedActions: out.proposedActions.map((p) => ({
        title: p.title,
        description: p.description,
        owner: p.owner,
        dueInDays: Math.min(90, Math.max(3, Math.round(p.dueInDays))),
        priority: p.priority,
      })),
    }
  } catch (err) {
    console.log("[v0] analyseAreaRaid failed for", input.area, (err as Error).message)
    return base
  }
}
