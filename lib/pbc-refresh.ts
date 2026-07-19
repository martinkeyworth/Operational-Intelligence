import "server-only"
import { currentPeriod } from "@/lib/learning-types"
import {
  getBarberBasics,
  getCurrentOneToOne,
  saveAiPbc,
  readSelfPrep,
} from "@/lib/learning"
import { threeSixtyReadiness } from "@/lib/three-sixty"
import { analysePbc } from "@/lib/pbc-ai"
import { getComplianceSignals } from "@/lib/compliance-signals"

export type PbcRegenResult = {
  ok: boolean
  /** Reason the regen was skipped (no side effects), when ok is false. */
  skipped?: "no-barber" | "no-1-2-1" | "completed" | "not-ready" | "ai-error"
  ai?: Record<string, unknown>
}

/**
 * Regenerate the AI PBC suggestion for a barber's CURRENT 1-2-1 from their 360
 * feedback (+ self-prep + compliance signals). This is the single source of
 * truth used by BOTH the manager's "Generate AI PBC" action and the automatic
 * refresh that fires whenever a new 360 response lands — so a completed 360
 * always pulls through to the 1-2-1 without anyone re-running it by hand.
 *
 * IMPORTANT: this only writes the `aiPbc` SUGGESTION on the 1-2-1. It never
 * touches the manager's final PBC scores (completeOneToOne / upsertPbcRating),
 * so auto-refreshing is safe and non-destructive to signed-off ratings.
 *
 * No auth here on purpose — the 360 reviewer submitting via a token link is not
 * an authenticated manager. Callers that are user-facing (the manager action)
 * must do their own authorisation before calling this.
 *
 * @param opts.requireReady When true (the automatic path), only regenerate once
 *   the 360 is ready (>= threshold responses, or window closed). The manager
 *   action passes false so they can force a suggestion at any time.
 */
export async function regeneratePbcForBarber(
  barberId: number,
  opts: { requireReady?: boolean } = {},
): Promise<PbcRegenResult> {
  const basics = await getBarberBasics(barberId)
  if (!basics) return { ok: false, skipped: "no-barber" }

  const oto = await getCurrentOneToOne(barberId)
  if (!oto) return { ok: false, skipped: "no-1-2-1" }
  // Never re-suggest on a signed-off review.
  if (oto.status === "Completed") return { ok: false, skipped: "completed" }

  const period = oto.period ?? currentPeriod()
  const readiness = await threeSixtyReadiness(barberId, period)

  // Policy: window closed with NO reviewers nominated → the barber controlled
  // that failure, so the PBC defaults to the lowest score (5). Manager may
  // override. (Mirrors the manual action's policy-auto path.)
  if (readiness.notNominated) {
    const WORST = 5
    const autoPbc = {
      performance: WORST,
      behaviours: WORST,
      contribution: WORST,
      overall: WORST,
      rationale: `No 360 reviewers were nominated for the ${period} cycle before the window closed. Per policy, a 360 that is never started defaults to the lowest score (${WORST}). Nominate reviewers and gather feedback to enable a full assessment; the manager may override this.`,
      lowConfidence: false,
      model: "policy-auto",
    }
    await saveAiPbc(oto.id, {
      ...autoPbc,
      responded: readiness.responded,
      threshold: readiness.threshold,
      notNominated: true,
      autoScored: true,
    })
    return {
      ok: true,
      ai: {
        ...autoPbc,
        responded: readiness.responded,
        threshold: readiness.threshold,
        notNominated: true,
        autoScored: true,
      },
    }
  }

  // Automatic path: hold off until the 360 is actually ready, so we don't
  // overwrite with a one-response low-confidence suggestion.
  if (opts.requireReady && !readiness.ready) return { ok: false, skipped: "not-ready" }

  const compliance = await getComplianceSignals(barberId)

  try {
    const ai = await analysePbc({
      cycleId: readiness.cycleId,
      barberName: basics.name,
      role: basics.role,
      selfPrep: readSelfPrep(oto),
      kpiNotes: null,
      complianceSignals: compliance.aiText,
      lowConfidence: readiness.lowConfidence || readiness.cycleId === null,
    })
    await saveAiPbc(oto.id, {
      ...ai,
      responded: readiness.responded,
      threshold: readiness.threshold,
    })
    return {
      ok: true,
      ai: { ...ai, responded: readiness.responded, threshold: readiness.threshold },
    }
  } catch (e) {
    console.log("[v0] regeneratePbcForBarber analysePbc failed:", (e as Error).message)
    return { ok: false, skipped: "ai-error" }
  }
}
