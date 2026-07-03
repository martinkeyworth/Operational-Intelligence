import "server-only"
import { db } from "@/lib/db"
import { barbers, threeSixtyCycles, threeSixtyNominees, threeSixtyResponses } from "@/lib/db/schema"
import { and, eq, isNotNull } from "drizzle-orm"

// ---------------------------------------------------------------------------
// 360 SERVER DATA LAYER — reviewer token flow + gating for the monthly 1-2-1.
// The 360 is the vital input to the AI PBC rating; once enough reviewers have
// responded (or the window closes) the linked 1-2-1 becomes ready.
// ---------------------------------------------------------------------------

// Minimum reviewer responses (out of 5 nominated) that auto-open the 1-2-1.
export const THREE_SIXTY_MIN_RESPONSES = 3

export type ReviewerContext = {
  nomineeId: number
  cycleId: number
  reviewerName: string
  barberName: string
  period: string
  dueOn: string | null
  alreadyResponded: boolean
  cycleStatus: string
}

/** Resolve a reviewer token to the barber they are reviewing. */
export async function getReviewerContext(token: string): Promise<ReviewerContext | null> {
  if (!token) return null
  const [nominee] = await db
    .select()
    .from(threeSixtyNominees)
    .where(eq(threeSixtyNominees.token, token))
    .limit(1)
  if (!nominee) return null

  const [cycle] = await db
    .select()
    .from(threeSixtyCycles)
    .where(eq(threeSixtyCycles.id, nominee.cycleId))
    .limit(1)
  if (!cycle) return null

  const [barber] = await db.select().from(barbers).where(eq(barbers.id, cycle.barberId)).limit(1)

  return {
    nomineeId: nominee.id,
    cycleId: cycle.id,
    reviewerName: nominee.name,
    barberName: barber?.name ?? "your colleague",
    period: cycle.period,
    dueOn: cycle.dueOn ?? null,
    alreadyResponded: nominee.respondedAt != null,
    cycleStatus: cycle.status,
  }
}

/** Store a reviewer's scored feedback and mark the nominee as responded. */
export async function submitReviewerFeedback(input: {
  token: string
  performance: number
  behaviours: number
  contribution: number
  relationship?: string
  strengths?: string
  improvements?: string
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getReviewerContext(input.token)
  if (!ctx) return { ok: false, error: "This feedback link is not valid." }
  if (ctx.alreadyResponded) return { ok: false, error: "You have already submitted feedback. Thank you!" }

  await db.insert(threeSixtyResponses).values({
    cycleId: ctx.cycleId,
    performance: input.performance,
    behaviours: input.behaviours,
    contribution: input.contribution,
    relationship: input.relationship ?? null,
    strengths: input.strengths ?? null,
    improvements: input.improvements ?? null,
  })

  await db
    .update(threeSixtyNominees)
    .set({ respondedAt: new Date(), completedAt: new Date(), status: "Completed" })
    .where(eq(threeSixtyNominees.id, ctx.nomineeId))

  return { ok: true }
}

/** Count reviewer responses received for a cycle. */
export async function countResponses(cycleId: number): Promise<number> {
  const rows = await db
    .select({ id: threeSixtyResponses.id })
    .from(threeSixtyResponses)
    .where(eq(threeSixtyResponses.cycleId, cycleId))
  return rows.length
}

/** All reviewer responses for a cycle — the raw input to the AI PBC analysis. */
export async function getResponsesForCycle(cycleId: number) {
  return db.select().from(threeSixtyResponses).where(eq(threeSixtyResponses.cycleId, cycleId))
}

/** The open 360 cycle for a barber+period, if any. */
export async function getCycleForPeriod(barberId: number, period: string) {
  const [cycle] = await db
    .select()
    .from(threeSixtyCycles)
    .where(and(eq(threeSixtyCycles.barberId, barberId), eq(threeSixtyCycles.period, period)))
    .limit(1)
  return cycle ?? null
}

/** Nominee + response progress for a cycle (for dashboards). */
export async function getCycleProgress(cycleId: number): Promise<{ nominated: number; responded: number }> {
  const noms = await db
    .select({ id: threeSixtyNominees.id })
    .from(threeSixtyNominees)
    .where(eq(threeSixtyNominees.cycleId, cycleId))
  const responded = await db
    .select({ id: threeSixtyNominees.id })
    .from(threeSixtyNominees)
    .where(and(eq(threeSixtyNominees.cycleId, cycleId), isNotNull(threeSixtyNominees.respondedAt)))
  return { nominated: noms.length, responded: responded.length }
}
