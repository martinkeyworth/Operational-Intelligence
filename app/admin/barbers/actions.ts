"use server"

import { db } from "@/lib/db"
import { barbers, sites, weeklyTakings } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
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

/**
 * Reassign a barber to a different site. New starters are auto-provisioned onto
 * the first site (LTZ Soresby) when they first sign in, so this lets an admin
 * correct someone who landed on the wrong site. The barber's existing takings
 * are re-filed to the new site too, so their submissions show under the right
 * site and the per-site RTB totals stay consistent.
 */
export async function changeBarberSite(formData: FormData) {
  await requireAdmin()

  const id = Number(formData.get("id"))
  const siteId = Number(formData.get("siteId"))
  if (!id) throw new Error("Invalid barber")
  if (!siteId) throw new Error("Invalid site")

  // Guard against a bad site id.
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId))
  if (!site) throw new Error("Unknown site")

  const [current] = await db
    .select({ siteId: barbers.siteId })
    .from(barbers)
    .where(eq(barbers.id, id))
  if (!current) throw new Error("Unknown barber")
  if (current.siteId === siteId) return // no-op

  await db.update(barbers).set({ siteId }).where(eq(barbers.id, id))
  // Re-file this barber's historical takings from their old site to the new one.
  await db
    .update(weeklyTakings)
    .set({ siteId })
    .where(and(eq(weeklyTakings.barberId, id), eq(weeklyTakings.siteId, current.siteId)))

  // Site rosters, registers and RTB totals all shift, so revalidate broadly.
  revalidatePath("/", "layout")
}
