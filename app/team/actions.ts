"use server"

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  barbers,
  leaveRequests,
  threeSixtyCycles,
  threeSixtyNominees,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/access"
import {
  getBarberForUser,
  resolveBarberForUser,
  currentLeaveYear,
  getHolidayCapacityConflict,
  getLeadershipHolidayConflict,
} from "@/lib/team"
import { isCeoEmail, isLeadershipHolidayEmail } from "@/lib/access-types"
import { isHolidayLocked } from "@/lib/format"
import {
  sendLeaveNotification,
  sendThreeSixtyInvites,
  sendSicknessAckToIndividual,
  sendHolidayCancellationNotice,
} from "@/lib/team-notify"
import { syncLeaveToCalendar } from "@/lib/leave-calendar"

/** Human-readable date for messages, e.g. "3 Aug 2026". */
function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** Count inclusive days between two ISO dates (min 1). */
function daysBetween(start: string, end: string): number {
  const a = new Date(start + "T00:00:00")
  const b = new Date(end + "T00:00:00")
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return Math.max(1, diff)
}

/**
 * Reject a range whose end falls before its start. daysBetween() clamps to a
 * minimum of 1, so without this an end-before-start range was silently stored
 * as a nonsensical "1 day" booking (e.g. "14 Oct 2026 → 17 Sep 2026 (1d)").
 * Returns an error string, or null when the range is valid.
 */
function invalidRangeError(start: string, end: string): string | null {
  const a = new Date(start + "T00:00:00")
  const b = new Date(end + "T00:00:00")
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return "Those dates aren't valid — please pick them again."
  }
  if (b.getTime() < a.getTime()) {
    return `The end date (${fmtDay(end)}) is before the start date (${fmtDay(start)}) — please check the dates.`
  }
  return null
}

/**
 * Days of holiday already committed in a leave year (Declined/Cancelled don't
 * hold a day). `excludeId` omits a booking that's being replaced, so a change
 * doesn't count the row it's about to supersede. Mirrors the balance shown on
 * the Team Area (lib/team.ts getBarberSelfView).
 */
async function holidayDaysUsed(
  barberId: number,
  leaveYear: number,
  excludeId?: number,
): Promise<number> {
  const rows = await db
    .select({ id: leaveRequests.id, days: leaveRequests.days, status: leaveRequests.status })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.barberId, barberId),
        eq(leaveRequests.kind, "holiday"),
        eq(leaveRequests.leaveYear, leaveYear),
      ),
    )
  return rows
    .filter((r) => r.status !== "Declined" && r.status !== "Cancelled" && r.id !== excludeId)
    .reduce((sum, r) => sum + r.days, 0)
}

/**
 * Stop a booking taking the barber past their annual entitlement. Without this
 * the balance silently went negative (e.g. "-6 / 28 days left" after 34 days
 * were booked against a 28-day allowance).
 */
async function allowanceError(
  barberId: number,
  allowance: number,
  days: number,
  leaveYear: number,
  excludeId?: number,
): Promise<string | null> {
  if (!allowance || allowance <= 0) return null
  const used = await holidayDaysUsed(barberId, leaveYear, excludeId)
  const left = allowance - used
  if (days > left) {
    return left <= 0
      ? `You've used all ${allowance} days of your holiday allowance for this leave year, so this booking can't be added.`
      : `That's ${days} days but you only have ${left} left of your ${allowance}-day allowance. Shorten the dates or cancel another booking.`
  }
  return null
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
  // Use the self-healing resolver (not the strict userId lookup) so a leader
  // whose roster row was unlinked / stale-linked is repaired on first action,
  // matching how the nav gate and /team page resolve their barber.
  const barber = await resolveBarberForUser({
    id: user.id,
    name: user.name,
    email: user.email,
  })
  if (!barber) throw new Error("not-linked")
  return { user, barber }
}

export async function requestHoliday(formData: FormData) {
  const { user, barber } = await requireLinkedBarber()
  const start = String(formData.get("startDate") ?? "")
  const end = String(formData.get("endDate") ?? start)
  const reason = String(formData.get("reason") ?? "").trim() || null
  if (!start) return { ok: false, error: "Start date required" }

  const rangeError = invalidRangeError(start, end)
  if (rangeError) return { ok: false, error: rangeError }

  const days = daysBetween(start, end)
  const noticeDays = noticeDaysUntil(start)
  const isException = noticeDays < HOLIDAY_NOTICE_DAYS

  // Don't let the booking push the balance past the annual entitlement.
  const leaveYear = currentLeaveYear()
  const overAllowance = await allowanceError(
    barber.id,
    barber.holidayAllowance,
    days,
    leaveYear,
  )
  if (overAllowance) return { ok: false, error: overAllowance }

  // Senior-leadership time-off rule (Martin/Cosmin/Mario), applied BEFORE the
  // per-site cap because it spans all sites: at most one of the trio may be off
  // at a time. Martin (CEO) always auto-APPROVES regardless — his holiday goes
  // straight onto the shared calendar with no approval step. Cosmin/Mario are
  // auto-DECLINED when another trio member already has approved holiday then.
  const email = (user.email ?? "").toLowerCase()
  if (isLeadershipHolidayEmail(email)) {
    const isCeo = isCeoEmail(email)
    const lead = await getLeadershipHolidayConflict({
      excludeBarberId: barber.id,
      start,
      end,
    })

    if (isCeo) {
      // Always approve. Note in the reason when it overlaps another leader.
      const note = lead.conflict
        ? ` (overlaps ${lead.withName ?? "another leader"} — approved as CEO)`
        : ""
      const [row] = await db
        .insert(leaveRequests)
        .values({
          barberId: barber.id,
          kind: "holiday",
          startDate: start,
          endDate: end,
          days,
          status: "Approved",
          reason: reason ? `${reason}${note}` : note || null,
          leaveYear: currentLeaveYear(),
          requestedByUserId: user.id,
          decidedByUserId: user.id,
          decidedAt: new Date(),
        })
        .returning({ id: leaveRequests.id })

      // Push straight to the shared company calendar (approved).
      await syncLeaveToCalendar(row.id)

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
      revalidatePath("/approvals")
      return { ok: true, autoApproved: true }
    }

    if (lead.conflict) {
      const declineReason = `${lead.withName ?? "Another member of the leadership team"} is already booked off between ${fmtDay(start)} and ${fmtDay(end)}. Only one of the senior leadership team can be off at a time, so this was automatically declined — ask for approval if it needs to overlap.`

      await db.insert(leaveRequests).values({
        barberId: barber.id,
        kind: "holiday",
        startDate: start,
        endDate: end,
        days,
        status: "Declined",
        reason: reason ? `${reason} — ${declineReason}` : declineReason,
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
        autoDeclined: true,
        autoDeclineReason: declineReason,
      })

      revalidatePath("/team")
      return { ok: true, autoDeclined: true, error: declineReason }
    }
    // No leadership clash → fall through to the normal site-cap + Pending flow.
  }

  // Concurrent time-off cap: if the site is already at capacity on any day in
  // the requested range (Cavendish/Woodseats/Academy = 1 person off, Soresby =
  // 2), the request is auto-declined at submission. Only approved holiday for
  // other barbers counts toward the cap.
  const capacity = await getHolidayCapacityConflict({
    siteId: barber.siteId,
    excludeBarberId: barber.id,
    start,
    end,
  })

  if (capacity.overCapacity) {
    const declineReason =
      capacity.cap === 1
        ? `Someone at your shop is already booked off between ${fmtDay(start)} and ${fmtDay(end)}. Only 1 person can be off at a time, so this was automatically declined.`
        : `Your shop already has ${capacity.cap} people booked off between ${fmtDay(start)} and ${fmtDay(end)}, which is the maximum. This was automatically declined.`

    await db.insert(leaveRequests).values({
      barberId: barber.id,
      kind: "holiday",
      startDate: start,
      endDate: end,
      days,
      status: "Declined",
      reason: reason ? `${reason} — ${declineReason}` : declineReason,
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
      autoDeclined: true,
      autoDeclineReason: declineReason,
    })

    revalidatePath("/team")
    return { ok: true, autoDeclined: true, error: declineReason }
  }

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
  const [sick] = await db
    .insert(leaveRequests)
    .values({
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
    .returning({ id: leaveRequests.id })

  // Mirror the sickness onto the shared company Google Calendar (barber invited
  // as attendee). No-op if Google Calendar isn't configured.
  await syncLeaveToCalendar(sick.id)

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
      barberId: leaveRequests.barberId,
      siteId: barbers.siteId,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
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

  // Approving can't push the site over its concurrent time-off cap.
  if (status === "Approved") {
    const capacity = await getHolidayCapacityConflict({
      siteId: row.siteId,
      excludeBarberId: row.barberId,
      start: String(row.startDate),
      end: String(row.endDate),
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

  await db
    .update(leaveRequests)
    .set({ status, decidedByUserId: user.id, decidedAt: new Date() })
    .where(eq(leaveRequests.id, id))

  // Reflect the decision on the shared company Google Calendar: an approval
  // adds the all-day holiday event (barber invited); a decline removes any
  // event that a prior approval created. No-op if calendar isn't configured.
  await syncLeaveToCalendar(id)

  revalidatePath("/approvals")
  revalidatePath("/admin/team")
  revalidatePath("/team")
  return { ok: true }
}

/**
 * Load a leave request together with its barber, and authorise the caller to
 * modify it. Allowed: the barber themselves, the barber's assigned manager, or
 * a team admin (company + dashboard). Returns the row or an error.
 */
async function loadLeaveForCaller(id: number) {
  const user = await requireUser()
  const [row] = await db
    .select({
      id: leaveRequests.id,
      barberId: leaveRequests.barberId,
      kind: leaveRequests.kind,
      status: leaveRequests.status,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      reason: leaveRequests.reason,
      siteId: barbers.siteId,
      managerUserId: barbers.managerUserId,
      barberName: barbers.name,
      holidayAllowance: barbers.holidayAllowance,
    })
    .from(leaveRequests)
    .innerJoin(barbers, eq(barbers.id, leaveRequests.barberId))
    .where(eq(leaveRequests.id, id))
  if (!row) return { error: "Request not found" as const }

  const isTeamAdmin = user.isCompany && user.canViewDashboard
  const callerBarber = await getBarberForUser(user.id)
  const isOwner = callerBarber?.id === row.barberId
  const isManager = row.managerUserId === user.id
  if (!isTeamAdmin && !isOwner && !isManager) {
    return { error: "You can't change this request" as const }
  }
  return { user, row, isOwner, callerName: user.name ?? callerBarber?.name ?? null }
}

/**
 * Cancel a holiday booking. Works for a still-Pending request (withdraws it) or
 * an already-Approved one (frees the day allowance + the shop's cover slot and
 * removes the shared-calendar entry immediately). Leadership + the manager get
 * an FYI when an approved booking is cancelled.
 */
export async function cancelLeave(formData: FormData) {
  const id = Number(formData.get("id"))
  const loaded = await loadLeaveForCaller(id)
  if ("error" in loaded) return { ok: false, error: loaded.error }
  const { row, callerName } = loaded

  if (row.kind !== "holiday") {
    return { ok: false, error: "Only holiday can be cancelled here" }
  }
  if (row.status !== "Pending" && row.status !== "Approved") {
    return { ok: false, error: "This request can no longer be cancelled" }
  }
  // Holiday is editable only up to the day it starts. Once it has begun (or is
  // in the past) it is fixed — neither the individual nor a manager can cancel.
  if (isHolidayLocked(String(row.startDate))) {
    return {
      ok: false,
      error: "This holiday has already started, so it can no longer be cancelled.",
    }
  }

  const wasApproved = row.status === "Approved"

  await db
    .update(leaveRequests)
    .set({ status: "Cancelled", decidedAt: new Date() })
    .where(eq(leaveRequests.id, id))

  // Remove any shared-calendar entry (a prior approval created one). No-op if
  // the calendar isn't configured or nothing was synced.
  await syncLeaveToCalendar(id)

  // FYI to leadership + manager only when an approved booking is pulled — a
  // withdrawn Pending request never reached the calendar or cover plan.
  if (wasApproved) {
    await sendHolidayCancellationNotice({
      barberId: row.barberId,
      barberName: row.barberName,
      start: String(row.startDate),
      end: String(row.endDate),
      days: row.endDate ? daysBetween(String(row.startDate), String(row.endDate)) : 1,
      wasApproved,
      byName: callerName,
    })
  }

  revalidatePath("/team")
  revalidatePath("/approvals")
  revalidatePath("/admin/team")
  return { ok: true, wasApproved }
}

/**
 * Change the dates of a holiday. A still-Pending request is edited in place and
 * re-checked against the shop's cap. An already-Approved booking is REBOOKED:
 * the old booking is cancelled (allowance/cover freed, calendar entry removed)
 * and the new dates are submitted as a fresh Pending request that re-runs the
 * cap check and goes back through approval.
 */
export async function changeHoliday(formData: FormData) {
  const id = Number(formData.get("id"))
  const newStart = String(formData.get("startDate") ?? "")
  const newEnd = String(formData.get("endDate") ?? newStart)
  if (!newStart) return { ok: false, error: "Start date required" }

  const loaded = await loadLeaveForCaller(id)
  if ("error" in loaded) return { ok: false, error: loaded.error }
  const { row, callerName } = loaded

  if (row.kind !== "holiday") {
    return { ok: false, error: "Only holiday dates can be changed here" }
  }
  if (row.status !== "Pending" && row.status !== "Approved") {
    return { ok: false, error: "This request can no longer be changed" }
  }
  // Fixed once it has started — neither the individual nor a manager can move
  // the dates of a holiday that has already begun (or is in the past).
  if (isHolidayLocked(String(row.startDate))) {
    return {
      ok: false,
      error: "This holiday has already started, so its dates can no longer be changed.",
    }
  }
  // The new start must also be in the future — you can't move a holiday into
  // today or the past.
  if (isHolidayLocked(newStart)) {
    return {
      ok: false,
      error: "Pick a start date in the future — holiday can't be moved to today or a past date.",
    }
  }

  const rangeError = invalidRangeError(newStart, newEnd)
  if (rangeError) return { ok: false, error: rangeError }

  const newDays = daysBetween(newStart, newEnd)
  const noticeDays = noticeDaysUntil(newStart)
  const isException = noticeDays < HOLIDAY_NOTICE_DAYS

  // Check the entitlement, ignoring the booking being replaced so moving dates
  // never counts the same holiday twice.
  const changeLeaveYear = currentLeaveYear()
  const overAllowance = await allowanceError(
    row.barberId,
    row.holidayAllowance ?? 28,
    newDays,
    changeLeaveYear,
    id,
  )
  if (overAllowance) return { ok: false, error: overAllowance }

  // The shop's concurrent time-off cap must allow the new dates. Own bookings
  // are excluded from the count, so the old approved row (still present here)
  // never blocks its own replacement.
  const capacity = await getHolidayCapacityConflict({
    siteId: row.siteId,
    excludeBarberId: row.barberId,
    start: newStart,
    end: newEnd,
  })
  if (capacity.overCapacity) {
    return {
      ok: false,
      error:
        capacity.cap === 1
          ? `Can't move to those dates — someone at your shop is already off between ${fmtDay(newStart)} and ${fmtDay(newEnd)} (limit 1 at a time).`
          : `Can't move to those dates — your shop already has ${capacity.cap} people off then (the maximum).`,
    }
  }

  // Pending → edit in place, stays Pending. No calendar entry exists yet.
  if (row.status === "Pending") {
    await db
      .update(leaveRequests)
      .set({ startDate: newStart, endDate: newEnd, days: newDays, leaveYear: currentLeaveYear() })
      .where(eq(leaveRequests.id, id))

    await sendLeaveNotification({
      kind: "holiday",
      barberId: row.barberId,
      barberName: row.barberName,
      start: newStart,
      end: newEnd,
      days: newDays,
      reason: row.reason,
      noticeDays,
      isException,
    })

    revalidatePath("/team")
    revalidatePath("/approvals")
    revalidatePath("/admin/team")
    return { ok: true, rebooked: false }
  }

  // Approved → rebook: cancel the old booking (frees allowance/cover + removes
  // its calendar entry), then create a fresh Pending request for the new dates.
  const oldStart = String(row.startDate)
  const oldEnd = String(row.endDate)
  const oldDays = daysBetween(oldStart, oldEnd)

  await db
    .update(leaveRequests)
    .set({ status: "Cancelled", decidedAt: new Date() })
    .where(eq(leaveRequests.id, id))
  await syncLeaveToCalendar(id)

  // The CEO's holiday is auto-approved on booking, so a CHANGE must approve too
  // — otherwise moving the dates silently downgraded it to Pending and told him
  // "Request sent to leadership", i.e. he'd be waiting on his own approval.
  const isCeoOwnBooking = loaded.isOwner && isCeoEmail((loaded.user.email ?? "").toLowerCase())
  const [rebooked] = await db
    .insert(leaveRequests)
    .values({
      barberId: row.barberId,
      kind: "holiday",
      startDate: newStart,
      endDate: newEnd,
      days: newDays,
      status: isCeoOwnBooking ? "Approved" : "Pending",
      reason: row.reason,
      leaveYear: currentLeaveYear(),
      requestedByUserId: loaded.user.id,
      ...(isCeoOwnBooking ? { decidedAt: new Date(), decidedByUserId: loaded.user.id } : {}),
    })
    .returning({ id: leaveRequests.id })

  // Straight onto the shared calendar, matching the auto-approved booking path.
  if (isCeoOwnBooking && rebooked) await syncLeaveToCalendar(rebooked.id)

  await sendHolidayCancellationNotice({
    barberId: row.barberId,
    barberName: row.barberName,
    start: oldStart,
    end: oldEnd,
    days: oldDays,
    wasApproved: true,
    byName: callerName,
    rebookedTo: { start: newStart, end: newEnd, days: newDays },
  })

  revalidatePath("/team")
  revalidatePath("/approvals")
  revalidatePath("/admin/team")
  return { ok: true, rebooked: true, autoApproved: isCeoOwnBooking }
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
