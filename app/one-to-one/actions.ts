"use server"

import { db } from "@/lib/db"
import { barbers, oneToOnes } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/access"
import { rescheduleOneToOne, parseLondonDateTimeLocal } from "@/lib/team-schedule"

/**
 * Complete a direct report's 1-2-1 and record notes. Scoped for MANAGERS:
 * the caller must be the barber's assigned manager (barbers.managerUserId) or a
 * team admin. A manager can therefore only ever complete a direct report's
 * 1-2-1 — never their own (their record points to their manager). Only an OPEN
 * (Scheduled) 1-2-1 can be completed; once Completed it is fixed, so no one can
 * overwrite input that has already been recorded — including their own
 * manager's. This is the ONLY write a non-admin manager can make here.
 */
export async function completeOneToOneScoped(formData: FormData) {
  const user = await requireUser()
  const id = Number(formData.get("id"))
  const notes = String(formData.get("notes") ?? "").trim() || null
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "Missing 1-2-1 reference" }
  }

  // Load the 1-2-1 with its barber so we can authorise AND enforce the lock.
  const [row] = await db
    .select({
      id: oneToOnes.id,
      status: oneToOnes.status,
      barberId: oneToOnes.barberId,
      managerUserId: barbers.managerUserId,
    })
    .from(oneToOnes)
    .innerJoin(barbers, eq(oneToOnes.barberId, barbers.id))
    .where(eq(oneToOnes.id, id))
  if (!row) return { ok: false, error: "1-2-1 not found" }

  const isManager = row.managerUserId != null && row.managerUserId === user.id
  const isTeamAdmin = Boolean(user.isCompany && user.canViewDashboard)
  if (!isManager && !isTeamAdmin) {
    return { ok: false, error: "You don't manage this person, so you can't complete their 1-2-1." }
  }

  if (row.status !== "Scheduled") {
    return {
      ok: false,
      error: "This 1-2-1 has already been completed and can no longer be changed.",
    }
  }

  await db
    .update(oneToOnes)
    .set({ status: "Completed", completedAt: new Date(), notes })
    .where(eq(oneToOnes.id, id))

  revalidatePath(`/one-to-one/${row.barberId}`)
  revalidatePath(`/admin/team/${row.barberId}`)
  revalidatePath("/admin/team")
  return { ok: true }
}

/**
 * Move a direct report's scheduled 1-2-1 to a new date/time. Same manager/admin
 * scoping as completeOneToOneScoped, so a manager can only move a direct
 * report's 1-2-1 — never their own. The 1-2-1 is moved in place (its calendar
 * event moves too); a Completed one is fixed and can't be moved.
 */
export async function rescheduleOneToOneScoped(formData: FormData) {
  const user = await requireUser()
  const id = Number(formData.get("id"))
  const whenRaw = String(formData.get("scheduledFor") ?? "").trim()
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Missing 1-2-1 reference" }
  if (!whenRaw) return { ok: false, error: "Pick a new date and time" }

  const [row] = await db
    .select({
      id: oneToOnes.id,
      status: oneToOnes.status,
      barberId: oneToOnes.barberId,
      managerUserId: barbers.managerUserId,
    })
    .from(oneToOnes)
    .innerJoin(barbers, eq(oneToOnes.barberId, barbers.id))
    .where(eq(oneToOnes.id, id))
  if (!row) return { ok: false, error: "1-2-1 not found" }

  const isManager = row.managerUserId != null && row.managerUserId === user.id
  const isTeamAdmin = Boolean(user.isCompany && user.canViewDashboard)
  if (!isManager && !isTeamAdmin) {
    return { ok: false, error: "You don't manage this person, so you can't move their 1-2-1." }
  }
  if (row.status !== "Scheduled") {
    return { ok: false, error: "This 1-2-1 has already been completed and can no longer be moved." }
  }

  // Interpret the picked value as UK wall-clock, not the UTC runtime's zone.
  const when = parseLondonDateTimeLocal(whenRaw)
  if (!when) return { ok: false, error: "Pick a new date and time" }

  try {
    await rescheduleOneToOne(id, when)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not move this 1-2-1" }
  }

  revalidatePath(`/one-to-one/${row.barberId}`)
  revalidatePath(`/admin/team/${row.barberId}`)
  revalidatePath("/admin/team")
  return { ok: true }
}
