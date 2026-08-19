"use server"

import { db } from "@/lib/db"
import { barbers, leaveRequests, oneToOnes, threeSixtyCycles } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireTeamAdmin } from "@/lib/access"
import { getBarberForUser, getHolidayCapacityConflict } from "@/lib/team"
import { scheduleOneToOne, rescheduleOneToOne, autoScheduleOneToOnes, autoOpenThreeSixtyCycles, syncOneToOneRsvps, parseLondonDateTimeLocal } from "@/lib/team-schedule"
import { syncLeaveToCalendar } from "@/lib/leave-calendar"

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

/** Approve or decline a holiday request. Approving is blocked if it would push
 *  the site over its concurrent time-off cap (e.g. two pending requests that
 *  each looked fine on their own but can't both be approved). */
export async function decideLeave(formData: FormData) {
  const admin = await requireTeamAdmin()
  const id = Number(formData.get("id"))
  const decision = String(formData.get("decision"))
  const status = decision === "approve" ? "Approved" : "Declined"

  if (status === "Approved") {
    const [req] = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
    if (!req) return { ok: false, error: "Request not found" }

    const [barber] = await db
      .select({ siteId: barbers.siteId })
      .from(barbers)
      .where(eq(barbers.id, req.barberId))
    if (barber) {
      const capacity = await getHolidayCapacityConflict({
        siteId: barber.siteId,
        excludeBarberId: req.barberId,
        start: String(req.startDate),
        end: String(req.endDate),
      })
      if (capacity.overCapacity) {
        return {
          ok: false,
          error:
            capacity.cap === 1
              ? "Can't approve — someone at that shop is already off for these dates (limit 1 at a time)."
              : `Can't approve — that shop already has ${capacity.cap} people off for these dates (the maximum).`,
        }
      }
    }
  }

  await db
    .update(leaveRequests)
    .set({ status, decidedByUserId: admin.id, decidedAt: new Date() })
    .where(eq(leaveRequests.id, id))

  // Reflect the decision on the shared company Google Calendar: approval adds
  // the all-day holiday event (barber invited); decline removes any event a
  // prior approval created. No-op if calendar isn't configured.
  await syncLeaveToCalendar(id)

  revalidateTeam()
  return { ok: true }
}

/** Manually schedule a NEW 1-2-1 for a barber (creates a fresh calendar event). */
export async function scheduleOneToOneNow(formData: FormData) {
  await requireTeamAdmin()
  const barberId = Number(formData.get("barberId"))
  const whenRaw = String(formData.get("scheduledFor") ?? "").trim()
  // Interpret the picked value as UK wall-clock, not the UTC runtime's zone.
  const when = parseLondonDateTimeLocal(whenRaw) ?? new Date(Date.now() + 7 * 864e5)
  await scheduleOneToOne(barberId, when)
  revalidateTeam(barberId)
  return { ok: true }
}

/** Move an existing scheduled 1-2-1 to a new date/time. Updates the same row
 *  and moves its calendar event in place (no duplicate row/event). */
export async function rescheduleOneToOneNow(formData: FormData) {
  await requireTeamAdmin()
  const id = Number(formData.get("id"))
  const whenRaw = String(formData.get("scheduledFor") ?? "").trim()
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Missing 1-2-1 reference" }
  const when = parseLondonDateTimeLocal(whenRaw)
  if (!when) return { ok: false, error: "Pick a new date and time" }
  try {
    await rescheduleOneToOne(id, when)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not move this 1-2-1" }
  }
  revalidateTeam()
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

/** Open a new 360 cycle for a barber (they then nominate 5 reviewers).
 *  Idempotent: if an Open cycle already exists for this barber we return it
 *  rather than inserting a duplicate (the old bug created a new Open cycle on
 *  every click). */
export async function openThreeSixtyCycle(formData: FormData) {
  await requireTeamAdmin()
  const barberId = Number(formData.get("barberId"))

  const [existing] = await db
    .select()
    .from(threeSixtyCycles)
    .where(and(eq(threeSixtyCycles.barberId, barberId), eq(threeSixtyCycles.status, "Open")))
  if (existing) {
    revalidateTeam(barberId)
    return { ok: true, alreadyOpen: true, period: existing.period }
  }

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
  return { ok: true, alreadyOpen: false, period }
}

/**
 * Run the automated scheduler on demand (same logic as the daily cron).
 * Schedules due 1-2-1s for barbers with a manager assigned, and opens any
 * outstanding 360 cycles for the half-year. Idempotent and safe to re-run.
 */
export async function runTeamScheduler() {
  await requireTeamAdmin()
  const oneToOnes = await autoScheduleOneToOnes()
  const threeSixties = await autoOpenThreeSixtyCycles()
  const rsvpUpdates = await syncOneToOneRsvps()
  revalidateTeam()
  return { ok: true, oneToOnes, threeSixties, rsvpUpdates }
}
