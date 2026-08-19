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

// 1-2-1s are auto-scheduled at 09:00 or 09:30 UK time — exactly two slots per
// manager per day, so a manager can never be double-booked (a clash) and each
// day has predictable, low-admin timings. Managers can still move a 1-2-1 to
// any date/time afterwards; this only governs the automatic generation.
const ONE_TO_ONE_SLOTS: [number, number][] = [
  [9, 0],
  [9, 30],
]

/** Europe/London UTC offset in minutes at a given instant (handles BST/GMT). */
function londonOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((asUtc - at.getTime()) / 60000)
}

/** The absolute Date for HH:MM UK wall-clock on a given London calendar day, so
 *  the stored instant renders as e.g. 09:00 London regardless of server TZ. */
function londonInstant(year: number, monthIndex: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, monthIndex, day, hour, minute, 0, 0)
  const offset = londonOffsetMinutes(new Date(guess))
  return new Date(guess - offset * 60000)
}

/** London calendar Y/M/D for an instant. */
function londonYmd(at: Date): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value
  return { y: +p.year, m: +p.month - 1, d: +p.day }
}

/** Earliest clash-free 09:00/09:30 UK slot for a manager on/after `from`,
 *  skipping any slot already taken by that manager. Returns null if the horizon
 *  is exhausted. */
function nextFreeOneToOneSlot(
  managerUserId: string,
  from: Date,
  occupied: Set<string>,
  horizonDays = 60,
): Date | null {
  const start = londonYmd(from)
  for (let d = 0; d < horizonDays; d++) {
    // Increment whole days from an anchored UTC noon so DST day-length changes
    // never skip or repeat a calendar day.
    const anchor = new Date(Date.UTC(start.y, start.m, start.d, 12, 0, 0))
    anchor.setUTCDate(anchor.getUTCDate() + d)
    for (const [h, mi] of ONE_TO_ONE_SLOTS) {
      const slot = londonInstant(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), h, mi)
      if (slot.getTime() < from.getTime()) continue
      if (!occupied.has(`${managerUserId}|${slot.getTime()}`)) return slot
    }
  }
  return null
}

/** Auto-schedule monthly 1-2-1s: every active, linked barber with a manager who
 *  hasn't had one in ~28 days gets a new one at the manager's next free
 *  09:00/09:30 UK slot (clash-free — at most two per manager per day). Runs
 *  daily with no manager intervention and is idempotent (safe to re-run — the
 *  28-day guard prevents duplicate rows, and each row keys a single calendar
 *  event). Returns how many were created. */
export async function autoScheduleOneToOnes(now = new Date()): Promise<number> {
  const rows = await db.select().from(barbers).where(eq(barbers.active, true))

  // Preload every still-Scheduled 1-2-1 so we never double-book a manager at a
  // slot they already hold (clash prevention), keyed by manager + exact start.
  const existing = await db
    .select({ managerUserId: oneToOnes.managerUserId, scheduledFor: oneToOnes.scheduledFor })
    .from(oneToOnes)
    .where(eq(oneToOnes.status, "Scheduled"))
  const occupied = new Set<string>()
  for (const e of existing) {
    if (!e.managerUserId) continue
    occupied.add(`${e.managerUserId}|${new Date(e.scheduledFor).getTime()}`)
  }

  // A few days out so barbers/managers get notice.
  const base = new Date(now)
  base.setDate(base.getDate() + 5)

  let created = 0
  for (const b of rows) {
    if (!b.managerUserId) continue
    if (await hasRecentOneToOne(b.id, 28)) continue

    const when = nextFreeOneToOneSlot(b.managerUserId, base, occupied)
    if (!when) {
      console.error(`[v0] No free 1-2-1 slot within horizon for barber ${b.id} (${b.name})`)
      continue
    }
    // Reserve the slot immediately so the next barber under the same manager
    // can't be assigned the same time in this run.
    const key = `${b.managerUserId}|${when.getTime()}`
    occupied.add(key)
    // Isolate each barber: a failure scheduling one must not abort the whole
    // run, otherwise a single bad row blocks everyone behind it.
    try {
      await scheduleOneToOne(b.id, when)
      created++
    } catch (err) {
      occupied.delete(key) // free the slot back so it can be reused
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
