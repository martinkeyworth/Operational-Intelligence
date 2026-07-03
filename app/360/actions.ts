"use server"

import { submitReviewerFeedback } from "@/lib/three-sixty"

// Public action — no auth. The tokenised link IS the credential, so we validate
// the token inside submitReviewerFeedback and never trust a bare cycle id.
export async function submitReviewerFeedbackAction(input: {
  token: string
  performance: number
  behaviours: number
  contribution: number
  relationship?: string
  strengths?: string
  improvements?: string
}): Promise<{ ok: boolean; error?: string }> {
  const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)))
  if (!input.token) return { ok: false, error: "Missing feedback link." }
  return submitReviewerFeedback({
    token: input.token,
    performance: clamp(input.performance),
    behaviours: clamp(input.behaviours),
    contribution: clamp(input.contribution),
    relationship: input.relationship?.trim() || undefined,
    strengths: input.strengths?.trim() || undefined,
    improvements: input.improvements?.trim() || undefined,
  })
}
