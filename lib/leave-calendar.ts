import "server-only"
import { db } from "@/lib/db"
import { barbers, leaveRequests, user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isCalendarConfigured, upsertCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar"

/**
 * Links the holiday & sickness process to the shared company Google Calendar.
 *
 * Policy (confirmed with leadership):
 *  - APPROVED holiday and RECORDED sickness are mirrored as all-day events on
 *    the shared LTZ calendar (GOOGLE_CALENDAR_ID). Pending / declined holiday is
 *    NOT shown.
 *  - The affected barber is added as an ATTENDEE, so the event also lands on
 *    their personal Google calendar and Google emails them the invite.
 *
 * Everything degrades gracefully: when Google Calendar isn't configured
 * (isCalendarConfigured() === false) every function here is a no-op, exactly
 * like the 1-2-1 / 360 sync. The leave row is always written first by the
 * caller, so a calendar failure never loses the request itself.
 */

/** Does this leave row belong on the shared calendar right now? */
export function shouldLeaveBeOnCalendar(kind: string, status: string): boolean {
  if (kind === "sickness") return status === "Recorded"
  // holiday
  return status === "Approved"
}

/** Format an ISO date (yyyy-mm-dd) as e.g. "5 Sep 2026" for descriptions. */
function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Reconcile a single leave row with the shared Google Calendar. Idempotent:
 *  - if it should be on the calendar, create or patch the event (keyed by the
 *    row via `leave-{id}`) and store the returned googleEventId;
 *  - if it should NOT be on the calendar but an event exists (e.g. a holiday
 *    that was approved then declined), cancel the event and clear the id.
 * No-op when Google Calendar isn't configured. Never throws — failures are
 * logged so the calling server action still succeeds.
 */
export async function syncLeaveToCalendar(leaveId: number): Promise<void> {
  if (!isCalendarConfigured()) return

  const [row] = await db
    .select({
      id: leaveRequests.id,
      kind: leaveRequests.kind,
      status: leaveRequests.status,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      googleEventId: leaveRequests.googleEventId,
      barberName: barbers.name,
      barberUserId: barbers.userId,
    })
    .from(leaveRequests)
    .innerJoin(barbers, eq(barbers.id, leaveRequests.barberId))
    .where(eq(leaveRequests.id, leaveId))
  if (!row) return

  const onCalendar = shouldLeaveBeOnCalendar(row.kind, row.status)

  // Should not be on the calendar: remove any existing event and clear the id.
  if (!onCalendar) {
    if (row.googleEventId) {
      try {
        await deleteCalendarEvent(row.googleEventId)
      } catch (err) {
        console.error(
          `[v0] leave calendar delete failed for leave ${leaveId}:`,
          err instanceof Error ? err.message : err,
        )
      }
      await db
        .update(leaveRequests)
        .set({ googleEventId: null, calendarSyncedAt: new Date() })
        .where(eq(leaveRequests.id, leaveId))
    }
    return
  }

  // Resolve the barber's login email so they can be invited as an attendee.
  const barberEmail = row.barberUserId
    ? (await db.select().from(userTable).where(eq(userTable.id, row.barberUserId)))[0]?.email
    : null
  const attendees = barberEmail ? [{ email: barberEmail, displayName: row.barberName }] : []

  const isHoliday = row.kind === "holiday"
  const start = new Date(String(row.startDate) + "T00:00:00Z")
  const end = new Date(String(row.endDate) + "T00:00:00Z")
  const rangeLabel =
    row.startDate === row.endDate
      ? fmtDay(String(row.startDate))
      : `${fmtDay(String(row.startDate))} – ${fmtDay(String(row.endDate))}`

  const summary = isHoliday ? `Holiday: ${row.barberName}` : `Off sick: ${row.barberName}`
  const description = isHoliday
    ? `Approved holiday for ${row.barberName} (${row.days} day${row.days === 1 ? "" : "s"}), ${rangeLabel}.${row.reason ? `\n\n${row.reason}` : ""}`
    : `${row.barberName} recorded as off sick (${row.days} day${row.days === 1 ? "" : "s"}), ${rangeLabel}.${row.reason ? `\n\n${row.reason}` : ""}`

  try {
    const event = await upsertCalendarEvent(
      {
        requestId: `leave-${row.id}`,
        summary,
        description,
        start,
        allDay: true,
        allDayEndDate: end,
        durationMinutes: 0,
        attendees,
      },
      row.googleEventId,
    )
    if (event) {
      await db
        .update(leaveRequests)
        .set({ googleEventId: event.eventId, calendarSyncedAt: new Date() })
        .where(eq(leaveRequests.id, leaveId))
    }
  } catch (err) {
    console.error(
      `[v0] leave calendar sync failed for leave ${leaveId}:`,
      err instanceof Error ? err.message : err,
    )
  }
}
