"use server"

import { db } from "@/lib/db"
import { barbers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/access"

/**
 * Remove a barber from the Barbers admin tab. Available to any admin (company
 * dashboard user), not just owners. Soft delete — the barber is marked inactive
 * so they drop off data entry, headcount tallies and the splits list, while
 * their historical takings rows are preserved for reporting. Reversible.
 */
export async function deactivateBarberAdmin(formData: FormData) {
  await requireAdmin()

  const id = Number(formData.get("id"))
  if (!id) throw new Error("Invalid barber")

  await db.update(barbers).set({ active: false }).where(eq(barbers.id, id))

  // Deactivating cascades to data entry, headcount, splits, site rosters and
  // reports, so revalidate the whole tree rather than a partial route list.
  revalidatePath("/", "layout")
}
