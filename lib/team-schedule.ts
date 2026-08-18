import "server-only"
import { db } from "@/lib/db"
import { barbers, oneToOnes, threeSixtyCycles, user as userTable } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { sendOneToOneInvite, sendThreeSixtyNominationNudge, sendOneToOneManagerCompletionLink } from "@/lib/team-notify"
import {
  isCalendarConfigured,
  upsertCalendarEvent,
  getEventRsvp,
  type RsvpStatus,
} from "@/lib/google-calendar"
import { isNotNull } from "drizzle-orm"
import { ensureCycleForPeriod } from "@/lib/three-sixty"

/** Create a 1-2-1 for a barber at the given time. When Google Calendar is
 *  configured it creates an event on the shared LTZ calendar (which emails the
 *  attendees so they can accept in Google and gives leadership visibility);
 *  otherwise it falls back to emailing a .ics invite. Returns the new row id. */
export async function scheduleOneToOne(barberId: number, when: Date): Promise<number> {
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  if (!barber) throw new Error("Barber not found")

  // Period is the calendar month the 1-2-1 falls in (YYYY-MM). Setting it here
  // keeps scheduled rows visible on the current-period learning roster and the
  // barber's Team Area (they all key off period).
  const period = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}`

  // The 360 is an integral input to this 1-2-1 — make sure a cycle exists for
  // the same period so reviewer feedback can be gathered and gate the review.
  try {
    const cycle = await ensureCycleForPeriod(barberId, period)
    // Only nudge the barber to nominate when the cycle is FIRST opened, so we
    // don't re-email on every reschedule within the same month.
    if (cycle.created) {
      try {
        await sendThreeSixtyNominationNudge({ barberId, period, dueOn: cycle.dueOn || null })
      } catch (err) {
        console.error(`[v0] sendThreeSixtyNominationNudge failed for barber ${barberId} (${period}):`, err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    console.error(`[v0] ensureCycleForPeriod failed for barber ${barberId} (${period}):`, err instanceof Error ? err.message : err)
  }

  const [row] = await db
    .insert(oneToOnes)
    .values({
      barberId,
      managerUserId: barber.managerUserId,
      scheduledFor: when,
      status: "Scheduled",
      autoScheduled: false,
      inviteSentAt: new Date(),
      period,
    })
    .returning({ id: oneToOnes.id })

  // Resolve emails for the invite.
  const barberEmail = barber.userId
    ? (await db.select().from(userTable).where(eq(userTable.id, barber.userId)))[0]?.email
    : null
  const manager = barber.managerUserId
    ? (await db.select().from(userTable).where(eq(userTable.id, barber.managerUserId)))[0]
    : null

  // ALWAYS send our own deliverable .ics invite from the verified
  // theltzgroup.com domain, with replies routed to the barber's manager. This
  // is the primary notification — we no longer depend on Google Calendar's
  // unmonitored no-reply email (which wasn't reaching attendees).
  await sendOneToOneInvite({
    oneToOneId: row.id,
    barberName: barber.name,
    barberEmail,
    managerName: manager?.name ?? null,
    managerEmail: manager?.email ?? null,
    scheduledFor: when,
    replyTo: manager?.email ?? null,
  })

  // If Google Calendar is configured, ALSO place the event on the shared LTZ
  // calendar for leadership visibility + native RSVP tracking — but with
  // sendUpdates:"none" so Google does NOT send its own no-reply email (the
  // deliverable invite above already notified everyone). Best-effort: a failure
  // here never loses the schedule or the invite.
  if (isCalendarConfigured()) {
    const attendees = [
      barberEmail ? { email: barberEmail, displayName: barber.name } : null,
      manager?.email ? { email: manager.email, displayName: manager.name ?? "Manager" } : null,
    ].filter(Boolean) as { email: string; displayName: string }[]

    try {
      const event = await upsertCalendarEvent(
        {
          requestId: `1-2-1-${row.id}`,
          summary: `1-2-1: ${barber.name}`,
          description: `Monthly 1-2-1 between ${barber.name} and ${manager?.name ?? "their manager"}.`,
          start: when,
          durationMinutes: 30,
          attendees,
        },
        undefined,
        "none",
      )
      if (event) {
        await db
          .update(oneToOnes)
          .set({ googleEventId: event.eventId, calendarSyncedAt: new Date() })
          .where(eq(oneToOnes.id, row.id))
      }
    } catch (err) {
      console.error(
        `[v0] 1-2-1 shared-calendar event failed for barber ${barberId} (invite already sent):`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Always give the manager a direct in-app link to complete this 1-2-1 (the
  // GDPR-scoped page), regardless of which calendar path ran above. Best-effort
  // so a mail hiccup never loses the scheduled row.
  if (manager?.email) {
    try {
      await sendOneToOneManagerCompletionLink({
        managerName: manager.name,
        managerEmail: manager.email,
        barberName: barber.name,
        barberId,
        scheduledFor: when,
      })
    } catch (err) {
      console.error(
        `[v0] 1-2-1 manager completion-link email failed for barber ${barberId}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return row.id
}

/**
 * Move an existing scheduled 1-2-1 to a new date/time IN PLACE. Unlike
 * scheduleOneToOne (which always inserts a fresh row + a new calendar event),
 * this updates the same row and PATCHES the existing Google Calendar event so it
 * simply moves — no duplicate rows and no orphaned events left at the old time.
 * Google re-notifies the attendees (sendUpdates:"all") so they can re-accept.
 * Only a still-Scheduled 1-2-1 can be moved; a Completed one is fixed. Throws if
 * the row is missing or already completed.
 */
export async function rescheduleOneToOne(oneToOneId: number, when: Date): Promise<void> {
  const [row] = await db.select().from(oneToOnes).where(eq(oneToOnes.id, oneToOneId))
  if (!row) throw new Error("1-2-1 not found")
  if (row.status !== "Scheduled") {
    throw new Error("This 1-2-1 has already been completed and can no longer be moved.")
  }

  const [barber] = await db.select().from(barbers).where(eq(barbers.id, row.barberId))
  if (!barber) throw new Error("Barber not found")

  const period = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}`

  // Move the row first — the schedule change must never be lost to a later
  // calendar hiccup.
  await db
    .update(oneToOnes)
    .set({ scheduledFor: when, period })
    .where(eq(oneToOnes.id, oneToOneId))

  // Keep the learning roster consistent if the move crosses a month boundary.
  if (period !== row.period) {
    try {
      await ensureCycleForPeriod(row.barberId, period)
    } catch (err) {
      console.error(
        `[v0] ensureCycleForPeriod (reschedule) failed for barber ${row.barberId} (${period}):`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Resolve attendee emails (same as scheduling).
  const barberEmail = barber.userId
    ? (await db.select().from(userTable).where(eq(userTable.id, barber.userId)))[0]?.email
    : null
  const manager = barber.managerUserId
    ? (await db.select().from(userTable).where(eq(userTable.id, barber.managerUserId)))[0]
    : null

  // ALWAYS send our own deliverable .ics UPDATE from theltzgroup.com (replies to
  // the manager). isUpdate + the default time-based SEQUENCE make it supersede
  // the recipient's existing calendar entry rather than creating a duplicate.
  await sendOneToOneInvite({
    oneToOneId,
    barberName: barber.name,
    barberEmail,
    managerName: manager?.name ?? null,
    managerEmail: manager?.email ?? null,
    scheduledFor: when,
    replyTo: manager?.email ?? null,
    isUpdate: true,
  })

  // If Google Calendar is configured, ALSO move the shared-calendar event in
  // place for leadership visibility — with sendUpdates:"none" so Google doesn't
  // send its own no-reply email (the deliverable update above already notified
  // everyone). Best-effort: the row move above is already persisted.
  if (isCalendarConfigured()) {
    const attendees = [
      barberEmail ? { email: barberEmail, displayName: barber.name } : null,
      manager?.email ? { email: manager.email, displayName: manager.name ?? "Manager" } : null,
    ].filter(Boolean) as { email: string; displayName: string }[]

    try {
      const event = await upsertCalendarEvent(
        {
          requestId: `1-2-1-${oneToOneId}`,
          summary: `1-2-1: ${barber.name}`,
          description: `Monthly 1-2-1 between ${barber.name} and ${manager?.name ?? "their manager"}.`,
          start: when,
          durationMinutes: 30,
          attendees,
        },
        // Patch the EXISTING event so it moves in place; if we don't have one
        // yet (e.g. it was created via .ics), this inserts a fresh event.
        row.googleEventId ?? undefined,
        "none",
      )
      if (event) {
        await db
          .update(oneToOnes)
          .set({ googleEventId: event.eventId, calendarSyncedAt: new Date() })
          .where(eq(oneToOnes.id, oneToOneId))
      }
    } catch (err) {
      console.error(
        `[v0] 1-2-1 reschedule shared-calendar move failed for 1-2-1 ${oneToOneId} (update already sent):`,
        err instanceof Error ? err.message : err,
      )
    }
  }
}

/** Has this barber had a 1-2-1 scheduled within the last `days` days? */
async function hasRecentOneToOne(barberId: number, days: number): Promise<boolean> {
  const [latest] = await db
    .select()
    .from(oneToOnes)
    .where(eq(oneToOnes.barberId, barberId))
    .orderBy(desc(oneToOnes.scheduledFor))
    .limit(1)
  if (!latest) return false
  const ageDays = (Date.now() - new Date(latest.scheduledFor).getTime()) / 864e5
  return ageDays < days
}

/** Auto-schedule monthly 1-2-1s: every active, linked barber with a manager
 *  who hasn't had one in ~30 days gets a new one a few days out. Idempotent —
 *  safe to run daily. Returns how many were created. */
export async function autoScheduleOneToOnes(now = new Date()): Promise<number> {
  const rows = await db.select().from(barbers).where(eq(barbers.active, true))
  let created = 0
  for (const b of rows) {
    if (!b.managerUserId) continue
    if (await hasRecentOneToOne(b.id, 28)) continue
    const when = new Date(now)
    when.setDate(when.getDate() + 5)
    when.setHours(10, 0, 0, 0)
    // Isolate each barber: a failure scheduling one must not abort the whole
    // run, otherwise a single bad row blocks everyone behind it.
    try {
      await scheduleOneToOne(b.id, when)
      created++
    } catch (err) {
      console.error(
        `[v0] Failed to auto-schedule 1-2-1 for barber ${b.id} (${b.name}):`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return created
}

/** Auto-open monthly 360 cycles. Opens a cycle for any active barber who has no
 *  cycle for the current period (YYYY-MM). The 360 gates that month's 1-2-1.
 *  Idempotent (safe to run daily). Returns how many opened. */
export async function autoOpenThreeSixtyCycles(now = new Date()): Promise<number> {
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const rows = await db.select().from(barbers).where(eq(barbers.active, true))
  let opened = 0
  for (const b of rows) {
    const [existing] = await db
      .select()
      .from(threeSixtyCycles)
      .where(and(eq(threeSixtyCycles.barberId, b.id), eq(threeSixtyCycles.period, period)))
      .limit(1)
    if (existing) continue
    // Due at the end of the period month.
    const due = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const [cycle] = await db
      .insert(threeSixtyCycles)
      .values({
        barberId: b.id,
        period,
        dueOn: due.toISOString().slice(0, 10),
        status: "Open",
      })
      .returning({ id: threeSixtyCycles.id })

    // Put an all-day milestone on the shared LTZ calendar so leadership can see
    // the 360 due date alongside everything else. The cycle row is already
    // saved, so a calendar failure here must not abort the run — log and move on.
    if (isCalendarConfigured()) {
      try {
        const event = await upsertCalendarEvent({
          requestId: `360-${cycle.id}`,
          summary: `360 review due: ${b.name} (${period})`,
          description: `360 feedback cycle for ${b.name}. Reviewers to complete by the due date.`,
          start: due,
          durationMinutes: 0,
          attendees: [],
          allDay: true,
        })
        if (event) {
          await db
            .update(threeSixtyCycles)
            .set({ googleEventId: event.eventId, calendarSyncedAt: new Date() })
            .where(eq(threeSixtyCycles.id, cycle.id))
        }
      } catch (err) {
        console.error(
          `[v0] 360 calendar event failed for barber ${b.id} (${b.name}):`,
          err instanceof Error ? err.message : err,
        )
      }
    }
    opened++
  }
  return opened
}

/**
 * Poll Google Calendar for RSVP changes on upcoming 1-2-1s and write the
 * barber's / manager's accept-decline status back into the app, so leadership
 * sees acceptance without leaving the dashboard. Idempotent; returns how many
 * rows were updated. No-op when Google Calendar isn't configured.
 */
export async function syncOneToOneRsvps(): Promise<number> {
  if (!isCalendarConfigured()) return 0

  // Only sync events that exist in Google and are still scheduled (future or
  // recent), to keep the API calls bounded.
  const rows = await db
    .select()
    .from(oneToOnes)
    .where(and(eq(oneToOnes.status, "Scheduled"), isNotNull(oneToOnes.googleEventId)))

  let updated = 0
  for (const o of rows) {
    if (!o.googleEventId) continue
    const rsvp = await getEventRsvp(o.googleEventId)
    if (!rsvp) continue

    // Resolve attendee emails so we can map responses to barber vs manager.
    const [barber] = await db.select().from(barbers).where(eq(barbers.id, o.barberId))
    const barberEmail = barber?.userId
      ? (await db.select().from(userTable).where(eq(userTable.id, barber.userId)))[0]?.email
      : null
    const managerEmail = o.managerUserId
      ? (await db.select().from(userTable).where(eq(userTable.id, o.managerUserId)))[0]?.email
      : null

    const lookup = (email?: string | null): RsvpStatus =>
      (email && rsvp.perAttendee.find((a) => a.email === email.toLowerCase())?.status) ||
      "needsAction"

    const barberResponse = lookup(barberEmail)
    const managerResponse = lookup(managerEmail)

    if (barberResponse !== o.barberResponse || managerResponse !== o.managerResponse) {
      await db
        .update(oneToOnes)
        .set({ barberResponse, managerResponse, rsvpSyncedAt: new Date() })
        .where(eq(oneToOnes.id, o.id))
      updated++
    }
  }
  return updated
}
