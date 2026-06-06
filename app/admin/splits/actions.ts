"use server"

import { db } from "@/lib/db"
import { barbers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireOwner } from "@/lib/access"

/**
 * Set a barber's profit-split %. Owner-only (Martin & Cosmin). The business
 * share is the remainder. Records who set it and when so the weekly review
 * can show stale splits.
 */
export async function setBarberSplit(formData: FormData) {
  const owner = await requireOwner()

  const id = Number(formData.get("id"))
  const pct = Number(formData.get("barberPct"))
  if (!id || Number.isNaN(pct)) throw new Error("Invalid input")
  if (pct < 0 || pct > 100) throw new Error("Percentage must be 0-100")

  await db
    .update(barbers)
    .set({
      barberPct: String(pct),
      splitSetBy: owner.name,
      splitSetAt: new Date(),
    })
    .where(eq(barbers.id, id))

  revalidatePath("/admin/splits")
}
