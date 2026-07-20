"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/access"
import { setCommEnabled, COMM_CHANNELS, type CommKey } from "@/lib/comms"

/**
 * Toggle a single communication channel on/off from a plain <form> submit.
 * Owner-only. The desired next value is posted explicitly as `enabled` ("1" or
 * "0") so there is no client-side state to diverge — the page is force-dynamic
 * and re-reads the DB after revalidatePath, so the UI always reflects the truth.
 */
export async function setCommAction(formData: FormData): Promise<void> {
  const user = await requireAdmin()
  if (!user.isOwner) return

  const key = String(formData.get("key") ?? "") as CommKey
  const enabled = String(formData.get("enabled") ?? "") === "1"
  if (!COMM_CHANNELS.some((c) => c.key === key)) return

  await setCommEnabled(key, enabled, user.id)
  revalidatePath("/admin/comms")
}
