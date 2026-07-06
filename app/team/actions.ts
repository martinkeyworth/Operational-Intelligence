"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  barbers,
  leaveRequests,
  threeSixtyCycles,
  threeSixtyNominees,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/access"
import { getBarberForUser, currentLeaveYear } from "@/lib/team"
import {
  sendLeaveNotification,
  sendThreeSixtyInvites,
  sendSicknessAckToIndividual,
} from "@/lib/team-notify"

/** Count inclusive days between two ISO dates (min 1). */
function daysBetween(start: string, end: string): number {
  const a = new Date(start + "T00:00:00")
  const b = new Date(end + "T00:00:00")
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return Math.max(1, diff)
}

/** Days of notice between today and the holiday start date (min 0). */
function noticeDaysUntil(start: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const s = new Date(start + "T00:00:00")
  const diff = Math.round((s.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

/** Policy: holiday needs at least one month's (30 days') notice. */
const HOLIDAY_NOTICE_DAYS = 30

/** Resolve the logged-in user's linked barber record or throw. */
async function requireLinkedBarber() {
  const user = await requireUser()
  const barber = await getBarberForUser(user.id)
  if (!barber) throw new Error("not-linked")
  return { user, barber }
}

export async function requestHoliday(formData: FormData) {
  const { user, barber } = await requireLinkedBarber()
  const start = String(formData.get("startDate") ?? "")
  const end = String(formData.get("endDate") ?? start)
  const reason = String(formData.get("reason") ?? "").trim() || null
  if (!start) return { ok: false, error: "Start date required" }

  const days = daysBetween(start, end)
  const noticeDays = noticeDaysUntil(start)
  const isException = noticeDays < HOLIDAY_NOTICE_DAYS
  await db.insert(leaveRequests).values({
    barberId: barber.id,
    kind: "holiday",
    startDate: start,
    endDate: end,
    days,
    status: "Pending",
    reason,
    leaveYear: currentLeaveYear(),
    requestedByUserId: user.id,
  })

  await sendLeaveNotification({
    kind: "holiday",
    barberId: barber.id,
    barberName: barber.name,
    start,
    end,
    days,
    reason,
    noticeDays,
    isException,
  })

  revalidatePath("/team")
  return { ok: true }
}

export async function logSickness(formData: FormData) {
  const { user, barber } = await requireLinkedBarber()
  const start = String(formData.get("startDate") ?? "")
  const end = String(formData.get("endDate") ?? start)
  const reason = String(formData.get("reason") ?? "").trim() || null
  if (!start) return { ok: false, error: "Date required" }

  const days = daysBetween(start, end)
  await db.insert(leaveRequests).values({
    barberId: barber.id,
    kind: "sickness",
    startDate: start,
    endDate: end,
    days,
    status: "Recorded",
    reason,
    leaveYear: currentLeaveYear(),
    requestedByUserId: user.id,
  })

  await sendLeaveNotification({
    kind: "sickness",
    barberId: barber.id,
    barberName: barber.name,
    start,
    end,
    days,
    reason,
  })

  // "Get well" acknowledgement to the barber themselves. If they run their own
  // column (active, non-apprentice) it also nudges them to arrange cover. Email
  // comes from their linked Better Auth user.
  await sendSicknessAckToIndividual({
    toEmail: user.email,
    firstName: barber.name.split(" ")[0],
    hasColumn: barber.active && !barber.isApprentice,
    start,
    end,
    days,
  })

  revalidatePath("/team")
  return { ok: true }
}

/**
 * Approve or decline a holiday request as the barber's assigned manager.
 * This is the scoped counterpart to the admin-only `decideLeave`: a manager
 * WITHOUT dashboard access can decide their own direct reports' requests, and
 * a team admin can decide any request. Authorisation is enforced against the
 * request's barber, never trusting the client.
 */
export async function decideLeaveScoped(formData: FormData) {
  const user = await requireUser()
  const id = Number(formData.get("id"))
  const decision = String(formData.get("decision"))
  const status = decision === "approve" ? "Approved" : "Declined"

  const [row] = await db
    .select({
      id: leaveRequests.id,
      managerUserId: barbers.managerUserId,
    })
    .from(leaveRequests)
    .innerJoin(barbers, eq(barbers.id, leaveRequests.barberId))
    .where(eq(leaveRequests.id, id))
  if (!row) return { ok: false, error: "Request not found" }

  const isTeamAdmin = user.isCompany && user.canViewDashboard
  if (!isTeamAdmin && row.managerUserId !== user.id) {
    return { ok: false, error: "You are not the manager for this request" }
  }

  await db
    .update(leaveRequests)
    .set({ status, decidedByUserId: user.id, decidedAt: new Date() })
    .where(eq(leaveRequests.id, id))

  revalidatePath("/approvals")
  revalidatePath("/admin/team")
  revalidatePath("/team")
  return { ok: true }
}

/** Submit the 5 nominees for the open 360 cycle and fire their invites. */
export async function submitThreeSixtyNominees(formData: FormData) {
  const { barber } = await requireLinkedBarber()
  const cycleId = Number(formData.get("cycleId"))
  const [cycle] = await db
    .select()
    .from(threeSixtyCycles)
    .where(eq(threeSixtyCycles.id, cycleId))
  if (!cycle || cycle.barberId !== barber.id) {
    return { ok: false, error: "Cycle not found" }
  }

  const nominees: { name: string; email: string }[] = []
  for (let i = 0; i < 5; i++) {
    const name = String(formData.get(`name_${i}`) ?? "").trim()
    const email = String(formData.get(`email_${i}`) ?? "").trim()
    if (name && email) nominees.push({ name, email })
  }
  if (nominees.length !== 5) {
    return { ok: false, error: "Please nominate exactly 5 people" }
  }

  // Each nominee gets a unique tokenised link to submit feedback at /360/[token].
  const withTokens = nominees.map((n) => ({ ...n, token: crypto.randomUUID() }))

  // Replace any existing nominees for this cycle.
  await db.delete(threeSixtyNominees).where(eq(threeSixtyNominees.cycleId, cycleId))
  await db.insert(threeSixtyNominees).values(
    withTokens.map((n) => ({
      cycleId,
      name: n.name,
      email: n.email,
      token: n.token,
      status: "Invited" as const,
      invitedAt: new Date(),
    })),
  )
  await db
    .update(threeSixtyCycles)
    .set({ inviteSentAt: new Date() })
    .where(eq(threeSixtyCycles.id, cycleId))

  await sendThreeSixtyInvites({
    barberName: barber.name,
    period: cycle.period,
    dueOn: cycle.dueOn,
    nominees: withTokens,
  })

  revalidatePath("/team")
  return { ok: true }
}
