"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
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
    barberName: barber.name,
    start,
    end,
    days,
    reason,
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

  // Replace any existing nominees for this cycle.
  await db.delete(threeSixtyNominees).where(eq(threeSixtyNominees.cycleId, cycleId))
  await db.insert(threeSixtyNominees).values(
    nominees.map((n) => ({
      cycleId,
      name: n.name,
      email: n.email,
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
    nominees,
  })

  revalidatePath("/team")
  return { ok: true }
}
