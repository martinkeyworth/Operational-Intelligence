"use server"

import { db } from "@/lib/db"
import { barbers, leaveRequests, oneToOnes, threeSixtyCycles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireTeamAdmin } from "@/lib/access"
import { getBarberForUser } from "@/lib/team"
import { scheduleOneToOne } from "@/lib/team-schedule"

function revalidateTeam(barberId?: number) {
  revalidatePath("/admin/team")
  if (barberId) revalidatePath(`/admin/team/${barberId}`)
  revalidatePath("/team")
}

/** Link / unlink a barber record to a Better Auth login account. */
export async function linkBarberUser(formData: FormData) {
  await requireTeamAdmin()
  const barberId = Number(formData.get("barberId"))
  const userId = String(formData.get("userId") ?? "").trim() || null

  // Guard: a login account can only be linked to one barber at a time.
  if (userId) {
    const existing = await getBarberForUser(userId)
    if (existing && existing.id !== barberId) {
      return { ok: false, error: `That login is already linked to ${existing.name}` }
    }
  }
  await db.update(barbers).set({ userId }).where(eq(barbers.id, barberId))
  revalidateTeam(barberId)
  return { ok: true }
}

/** Assign the manager who runs a barber's monthly 1-2-1. */
export async function setManager(formData: FormData) {
  await requireTeamAdmin()
  const barberId = Number(formData.get("barberId"))
  const managerUserId = String(formData.get("managerUserId") ?? "").trim() || null
  await db.update(barbers).set({ managerUserId }).where(eq(barbers.id, barberId))
  revalidateTeam(barberId)
  return { ok: true }
}

/** Update HR profile: apprentice flag, start date, holiday allowance. */
export async function updateBarberProfile(formData: FormData) {
  await requireTeamAdmin()
  const barberId = Number(formData.get("barberId"))
  const isApprentice = formData.get("isApprentice") === "on"
  const startDate = String(formData.get("startDate") ?? "").trim() || null
  const holidayAllowance = Number(formData.get("holidayAllowance")) || 28
  await db
    .update(barbers)
    .set({ isApprentice, startDate, holidayAllowance })
    .where(eq(barbers.id, barberId))
  revalidateTeam(barberId)
  return { ok: true }
}

/** Approve or decline a holiday request. */
export async function decideLeave(formData: FormData) {
  const admin = await requireTeamAdmin()
  const id = Number(formData.get("id"))
  const decision = String(formData.get("decision"))
  const status = decision === "approve" ? "Approved" : "Declined"
  await db
    .update(leaveRequests)
    .set({ status, decidedByUserId: admin.id, decidedAt: new Date() })
    .where(eq(leaveRequests.id, id))
  revalidateTeam()
  return { ok: true }
}

/** Manually schedule (or reschedule) the next 1-2-1 for a barber. */
export async function scheduleOneToOneNow(formData: FormData) {
  await requireTeamAdmin()
  const barberId = Number(formData.get("barberId"))
  const whenRaw = String(formData.get("scheduledFor") ?? "").trim()
  const when = whenRaw ? new Date(whenRaw) : new Date(Date.now() + 7 * 864e5)
  await scheduleOneToOne(barberId, when)
  revalidateTeam(barberId)
  return { ok: true }
}

/** Mark a 1-2-1 as completed. */
export async function completeOneToOne(formData: FormData) {
  await requireTeamAdmin()
  const id = Number(formData.get("id"))
  const notes = String(formData.get("notes") ?? "").trim() || null
  await db
    .update(oneToOnes)
    .set({ status: "Completed", completedAt: new Date(), notes })
    .where(eq(oneToOnes.id, id))
  revalidateTeam()
  return { ok: true }
}

/** Open a new 360 cycle for a barber (they then nominate 5 reviewers). */
export async function openThreeSixtyCycle(formData: FormData) {
  await requireTeamAdmin()
  const barberId = Number(formData.get("barberId"))
  const now = new Date()
  const half = now.getMonth() < 6 ? "H1" : "H2"
  const period = `${now.getFullYear()}-${half}`
  const due = new Date(now)
  due.setDate(due.getDate() + 21)
  await db.insert(threeSixtyCycles).values({
    barberId,
    period,
    dueOn: due.toISOString().slice(0, 10),
    status: "Open",
  })
  revalidateTeam(barberId)
  return { ok: true }
}
