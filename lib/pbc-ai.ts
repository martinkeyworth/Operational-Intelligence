import "server-only"
import { generateText, Output } from "ai"
import { z } from "zod"
import {
  PBC_BANDS,
  PBC_DIMENSIONS,
  ONE_TO_ONE_QUESTIONS,
  type OneToOneAnswers,
  type SelfPrep,
} from "@/lib/learning-types"
import { getResponsesForCycle } from "@/lib/three-sixty"

// The model used for the PBC analysis. gpt-5.4-mini is fast and reliable for
// structured scoring; runs through the Vercel AI Gateway (zero-config).
const PBC_MODEL = "openai/gpt-5.4-mini"

export type AiPbcResult = {
  performance: number
  behaviours: number
  contribution: number
  overall: number
  rationale: string
  lowConfidence: boolean
  model: string
}

const pbcSchema = z.object({
  performance: z.number().int().min(1).max(5).describe("Performance score, 1 best - 5 lowest"),
  behaviours: z.number().int().min(1).max(5).describe("Behaviours score, 1 best - 5 lowest"),
  contribution: z.number().int().min(1).max(5).describe("Contribution score, 1 best - 5 lowest"),
  overall: z.number().int().min(1).max(5).describe("Overall PBC score, 1 best - 5 lowest"),
  rationale: z
    .string()
    .describe("2-4 sentence justification citing the 360 feedback, self-prep, KPI and operational-compliance signals."),
})

function bandGuide(): string {
  return PBC_BANDS.map((b) => `${b.score} = ${b.label}: ${b.description}`).join("\n")
}

function summariseAnswers(answers: OneToOneAnswers | undefined): string {
  if (!answers) return "(none provided)"
  const lines: string[] = []
  for (const q of ONE_TO_ONE_QUESTIONS) {
    const v = answers[q.id]
    if (v === null || v === undefined || v === "") continue
    lines.push(`- [${q.dimension ?? "context"}] ${q.prompt} -> ${String(v)}`)
  }
  return lines.length ? lines.join("\n") : "(none provided)"
}

/**
 * Analyse the 360 responses + the barber's self-prep + KPI notes and propose
 * PBC scores. The manager can override these before completing the 1-2-1.
 * `lowConfidence` is set when fewer than the threshold reviewers responded.
 */
export async function analysePbc(input: {
  cycleId: number | null
  barberName: string
  role?: string | null
  selfPrep?: SelfPrep | null
  kpiNotes?: string | null
  /**
   * Auto-compiled operational-compliance evidence (missed/late weekly
   * confirmations, >5 red RAID, stale RAID, overdue tasks). These are
   * system-recorded facts and must materially weigh on Behaviours &
   * Contribution.
   */
  complianceSignals?: string | null
  lowConfidence?: boolean
}): Promise<AiPbcResult> {
  const responses = input.cycleId ? await getResponsesForCycle(input.cycleId) : []

  const three60 = responses.length
    ? responses
        .map(
          (r, i) =>
            `Reviewer ${i + 1} (${r.relationship ?? "colleague"}): P=${r.performance ?? "-"} B=${r.behaviours ?? "-"} C=${r.contribution ?? "-"}\n  Strengths: ${r.strengths ?? "-"}\n  To improve: ${r.improvements ?? "-"}`,
        )
        .join("\n\n")
    : "(no 360 responses received)"

  const self = input.selfPrep
  const selfScores = self
    ? `Self P=${self.selfPerformance ?? "-"} B=${self.selfBehaviours ?? "-"} C=${self.selfContribution ?? "-"}; reason: ${self.selfReason ?? "-"}`
    : "(no self-assessment submitted)"

  const dims = PBC_DIMENSIONS.map((d) => `${d.label}: ${d.blurb}`).join("\n")

  const prompt = `You are an impartial performance analyst for Less Than Zero Barbers. Rate the barber "${input.barberName}"${input.role ? ` (working toward/at role: ${input.role})` : ""} on the PBC model for this monthly review.

The three PBC dimensions:
${dims}

Scoring bands (1 is best, 5 is lowest):
${bandGuide()}

=== 360 reviewer feedback (the vital input) ===
${three60}

=== Barber self-assessment ===
${selfScores}
Self-prep answers:
${summariseAnswers(self?.answers)}

=== KPI / operational notes ===
${input.kpiNotes ?? "(none provided)"}

=== Operational-compliance signals (auto-compiled from the app) ===
${input.complianceSignals ?? "(none provided)"}

Weigh the 360 feedback most heavily for the overall picture, corroborated by the self-prep and KPI signals; where the 360 sample is small, be conservative and avoid extreme scores.

However, the operational-compliance signals above are system-recorded FACTS, not opinion. Where they show failings — missed or late weekly confirmations, carrying more than five open red RAID items, stale/not-updated RAID, or overdue required tasks — they must materially LOWER the Behaviours and Contribution scores (a higher/worse number, since 1 is best and 5 is lowest) and you MUST cite the specific failing in the rationale. If the signals are clean, do not penalise. Return integer scores 1-5 for performance, behaviours, contribution, and an overall score (holistic, not a naive average), plus a concise rationale that references both the 360 feedback and any compliance failings.`

  const { experimental_output } = await generateText({
    model: PBC_MODEL,
    experimental_output: Output.object({ schema: pbcSchema }),
    prompt,
  })

  const out = experimental_output
  const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)))
  return {
    performance: clamp(out.performance),
    behaviours: clamp(out.behaviours),
    contribution: clamp(out.contribution),
    overall: clamp(out.overall),
    rationale: out.rationale,
    lowConfidence: Boolean(input.lowConfidence),
    model: PBC_MODEL,
  }
}
