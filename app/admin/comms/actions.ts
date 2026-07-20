"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/access"
import { setCommEnabled, COMM_CHANNELS, type CommKey } from "@/lib/comms"

/**
 * Toggle a single communication channel on/off. Owner-only. Returns the new
 * state so the client can reflect it optimistically.
 */
export async function toggleComm(
  key: CommKey,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAdmin()
  if (!user.isOwner) return { ok: false, error: "Owner only." }
  if (!COMM_CHANNELS.some((c) => c.key === key)) {
    return { ok: false, error: "Unknown channel." }
  }
  await setCommEnabled(key, enabled, user.id)
  revalidatePath("/admin/comms")
  return { ok: true }
}
