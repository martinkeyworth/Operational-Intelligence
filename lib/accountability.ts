import "server-only"
import { db } from "@/lib/db"
import { accountabilityEvents } from "@/lib/db/schema"
import { and, desc, eq, gte, isNull } from "drizzle-orm"

export type AccountabilityKind = "1-2-1" | "360-nomination" | "action"

export type AccountabilityMiss = {
  id: number
  kind: string
  ref: string
  period: string | null
  detail: string | null
  remindedAt: string
  resolvedAt: string | null
}

/**
 * Record that an accountability item was missed after its single reminder.
 * Idempotent: the unique index on (kind, ref, user, barber) means re-logging
 * the same miss does nothing, so this is safe to call from an every-day cron.
 */
export async function logAccountabilityMiss(args: {
  kind: AccountabilityKind
  ref: string
  userId?: string | null
  barberId?: number | null
  period?: string | null
  detail?: string | null
}): Promise<void> {
  try {
    await db
      .insert(accountabilityEvents)
      .values({
        kind: args.kind,
        ref: args.ref,
        userId: args.userId ?? null,
        barberId: args.barberId ?? null,
        period: args.period ?? null,
        detail: args.detail ?? null,
      })
      .onConflictDoNothing()
  } catch (e) {
    // Never let logging a miss break the cron that detected it.
    console.log("[v0] logAccountabilityMiss failed:", (e as Error).message)
  }
}

/** Mark a previously-logged miss resolved (e.g. the 1-2-1 was completed late). */
export async function resolveAccountabilityMiss(args: {
  kind: AccountabilityKind
  ref: string
}): Promise<void> {
  try {
    await db
      .update(accountabilityEvents)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(accountabilityEvents.kind, args.kind),
          eq(accountabilityEvents.ref, args.ref),
          isNull(accountabilityEvents.resolvedAt),
        ),
      )
  } catch (e) {
    console.log("[v0] resolveAccountabilityMiss failed:", (e as Error).message)
  }
}

/**
 * Missed accountability items for a barber since a given date, most recent
 * first. Feeds the PBC compliance signals so a pattern of missing the ONE
 * reminder shows up in the development review (accountability by scoring, not
 * by nagging).
 */
export async function getAccountabilityMisses(
  barberId: number,
  sinceIso: string,
): Promise<AccountabilityMiss[]> {
  const rows = await db
    .select()
    .from(accountabilityEvents)
    .where(
      and(
        eq(accountabilityEvents.barberId, barberId),
        gte(accountabilityEvents.createdAt, new Date(sinceIso)),
      ),
    )
    .orderBy(desc(accountabilityEvents.createdAt))
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    ref: r.ref,
    period: r.period,
    detail: r.detail,
    remindedAt:
      r.remindedAt instanceof Date ? r.remindedAt.toISOString() : String(r.remindedAt),
    resolvedAt:
      r.resolvedAt == null
        ? null
        : r.resolvedAt instanceof Date
          ? r.resolvedAt.toISOString()
          : String(r.resolvedAt),
  }))
}
