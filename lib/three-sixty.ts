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
  barberId: number
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
    barberId: cycle.barberId,
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

  // Auto-refresh the 1-2-1's AI PBC so a completed 360 pulls straight through
  // (only once the 360 is ready). Best-effort + dynamic import to avoid a
  // circular dependency; a failure here must never block the reviewer's submit.
  try {
    const { regeneratePbcForBarber } = await import("@/lib/pbc-refresh")
    const res = await regeneratePbcForBarber(ctx.barberId, { requireReady: true })
    if (res.ok) {
      const { revalidatePath } = await import("next/cache")
      revalidatePath(`/learning/plans/${ctx.barberId}`)
    }
  } catch (e) {
    console.log("[v0] auto PBC refresh after 360 response failed:", (e as Error).message)
  }

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

export type ThreeSixtyReadiness = {
  cycleId: number | null
  nominated: number
  responded: number
  threshold: number
  windowClosed: boolean
  ready: boolean
  /** True when we should proceed but flag the AI as low-confidence (window
   *  closed with fewer than the threshold number of responses). */
  lowConfidence: boolean
  /** True when the window has closed and the barber never nominated ANY
   *  reviewers. This is within the barber's control, so it drives an automatic
   *  worst PBC score (rather than low-confidence, which is for the case where
   *  the barber nominated but reviewers didn't reply in time). */
  notNominated: boolean
}

/**
 * Whether the 360 for this barber+period is ready to unlock the 1-2-1.
 * Ready = at least THREE_SIXTY_MIN_RESPONSES responses in, OR the cycle window
 * has closed (past due / status Closed). When the window closes with too few
 * responses we still proceed, but flag low confidence for the AI PBC analysis.
 */
export async function threeSixtyReadiness(barberId: number, period: string, now = new Date()): Promise<ThreeSixtyReadiness> {
  const cycle = await getCycleForPeriod(barberId, period)
  if (!cycle) {
    return { cycleId: null, nominated: 0, responded: 0, threshold: THREE_SIXTY_MIN_RESPONSES, windowClosed: false, ready: false, lowConfidence: false, notNominated: false }
  }
  const { nominated, responded } = await getCycleProgress(cycle.id)
  const duePassed = cycle.dueOn ? new Date(cycle.dueOn) < now : false
  const windowClosed = cycle.status === "Closed" || duePassed
  const enough = responded >= THREE_SIXTY_MIN_RESPONSES
  const ready = enough || windowClosed
  const notNominated = windowClosed && nominated === 0
  return {
    cycleId: cycle.id,
    nominated,
    responded,
    threshold: THREE_SIXTY_MIN_RESPONSES,
    windowClosed,
    ready,
    // A closed window with too few responses is low confidence — UNLESS the
    // reason is that nobody was ever nominated, which is handled separately as
    // an automatic worst score.
    lowConfidence: ready && !enough && !notNominated,
    notNominated,
  }
}

/**
 * Ensure an Open 360 cycle exists for this barber+period (monthly). Idempotent:
 * returns the existing cycle id if one is already there, otherwise creates one
 * due at the end of the period's month. Nominees/invites are added when the
 * barber nominates from their Team Area.
 */
export async function ensureCycleForPeriod(
  barberId: number,
  period: string,
): Promise<{ id: number; created: boolean; dueOn: string }> {
  const existing = await getCycleForPeriod(barberId, period)
  if (existing) return { id: existing.id, created: false, dueOn: existing.dueOn ?? "" }
  // Due at the last day of the period month.
  const [y, m] = period.split("-").map(Number)
  const due = new Date(y, m, 0) // day 0 of next month = last day of this month
  const dueOn = due.toISOString().slice(0, 10)
  const [cycle] = await db
    .insert(threeSixtyCycles)
    .values({
      barberId,
      period,
      dueOn,
      status: "Open",
    })
    .returning({ id: threeSixtyCycles.id })
  return { id: cycle.id, created: true, dueOn }
}
