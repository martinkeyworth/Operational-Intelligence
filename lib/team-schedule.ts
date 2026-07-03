import "server-only"
import { db } from "@/lib/db"
import { barbers, oneToOnes, threeSixtyCycles, user as userTable } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { sendOneToOneInvite } from "@/lib/team-notify"
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
    await ensureCycleForPeriod(barberId, period)
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

  // Email a .ics calendar invite to the barber + their manager. Used as the
  // primary path when Google Calendar isn't configured, and as the automatic
  // fallback if the Google Calendar call fails for any reason.
  const sendIcsFallback = () =>
    sendOneToOneInvite({
      oneToOneId: row.id,
      barberName: barber.name,
      barberEmail,
      managerName: manager?.name ?? null,
      managerEmail: manager?.email ?? null,
      scheduledFor: when,
    })

  if (isCalendarConfigured()) {
    // Google Calendar path: create a real event on the shared calendar. Google
    // sends the invite emails and tracks RSVPs natively. If this fails at
    // runtime (bad credentials, delegation not granted, API error), we degrade
    // gracefully to the .ics email instead of throwing — the 1-2-1 row has
    // already been created, so the schedule itself is never lost.
    const attendees = [
      barberEmail ? { email: barberEmail, displayName: barber.name } : null,
      manager?.email ? { email: manager.email, displayName: manager.name ?? "Manager" } : null,
    ].filter(Boolean) as { email: string; displayName: string }[]

    try {
      const event = await upsertCalendarEvent({
        requestId: `1-2-1-${row.id}`,
        summary: `1-2-1: ${barber.name}`,
        description: `Monthly 1-2-1 between ${barber.name} and ${manager?.name ?? "their manager"}.`,
        start: when,
        durationMinutes: 30,
        attendees,
      })
      if (event) {
        await db
          .update(oneToOnes)
          .set({ googleEventId: event.eventId, calendarSyncedAt: new Date() })
          .where(eq(oneToOnes.id, row.id))
      } else {
        // Calendar unconfigured at call time — use the email invite.
        await sendIcsFallback()
      }
    } catch (err) {
      console.error(
        `[v0] 1-2-1 calendar event failed for barber ${barberId}; falling back to .ics email:`,
        err instanceof Error ? err.message : err,
      )
      await sendIcsFallback()
    }
  } else {
    await sendIcsFallback()
  }
  return row.id
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
