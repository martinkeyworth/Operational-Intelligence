import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { commSettings } from "@/lib/db/schema"
import { COMM_CHANNELS, type CommKey } from "@/lib/comms-config"

// Re-export the client-safe registry so existing server imports keep working.
export { COMM_CHANNELS, type CommKey, type CommChannel } from "@/lib/comms-config"

/** Map of channel key -> enabled. Missing rows default to enabled (true). */
export async function getCommSettings(): Promise<Record<CommKey, boolean>> {
  const rows = await db
    .select({ key: commSettings.key, enabled: commSettings.enabled })
    .from(commSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.enabled])) as Partial<
    Record<CommKey, boolean>
  >
  const result = {} as Record<CommKey, boolean>
  for (const c of COMM_CHANNELS) result[c.key] = map[c.key] ?? true
  return result
}

/** Whether a single channel is currently enabled (default true when no row). */
export async function isCommEnabled(key: CommKey): Promise<boolean> {
  const rows = await db
    .select({ enabled: commSettings.enabled })
    .from(commSettings)
    .where(eq(commSettings.key, key))
    .limit(1)
  return rows[0]?.enabled ?? true
}

/** Upsert a channel's enabled flag. Returns the value actually persisted. */
export async function setCommEnabled(
  key: CommKey,
  enabled: boolean,
  userId: string | null,
): Promise<boolean> {
  const rows = await db
    .insert(commSettings)
    .values({ key, enabled, updatedByUserId: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: commSettings.key,
      set: { enabled, updatedByUserId: userId, updatedAt: new Date() },
    })
    .returning({ enabled: commSettings.enabled })
  return rows[0]?.enabled ?? enabled
}
