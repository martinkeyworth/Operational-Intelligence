import "server-only"
import { google, type calendar_v3 } from "googleapis"

/**
 * Google Calendar integration for the LTZ Team Area.
 *
 * Auth model (per leadership decision):
 *  - A Google Workspace **service account** with **domain-wide delegation**.
 *  - It impersonates a Workspace user (GOOGLE_IMPERSONATE_EMAIL) so it is
 *    allowed to invite attendees and send updates.
 *  - All 1-2-1 / 360 events are created on a single **shared calendar**
 *    (GOOGLE_CALENDAR_ID) that leadership subscribes to for visibility.
 *
 * Required env vars (set in Vercel Project Settings):
 *  - GOOGLE_SERVICE_ACCOUNT_EMAIL   service account address
 *  - GOOGLE_SERVICE_ACCOUNT_KEY     service account private key (PEM). Paste the
 *                                   full key; literal "\n" sequences are handled.
 *  - GOOGLE_IMPERSONATE_EMAIL       Workspace user to impersonate (e.g. an
 *                                   owner/HR director on @lessthanzerobarbers.com)
 *  - GOOGLE_CALENDAR_ID             the shared calendar id (e.g. the calendar's
 *                                   address). Defaults to "primary" of the
 *                                   impersonated user if unset.
 *
 * Everything degrades gracefully: if the integration isn't configured,
 * isCalendarConfigured() returns false and callers fall back to .ics email.
 */

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"]

export function isCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
      process.env.GOOGLE_IMPERSONATE_EMAIL,
  )
}

export function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || "primary"
}

function normalizeKey(raw: string): string {
  // Vercel env values commonly store the PEM with escaped "\n". Convert back to
  // real newlines, and strip wrapping quotes if present.
  let key = raw.trim()
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1)
  }
  return key.replace(/\\n/g, "\n")
}

let _client: calendar_v3.Calendar | null = null

/** Build (and memoize) an authenticated Calendar client, or null if unconfigured. */
function calendarClient(): calendar_v3.Calendar | null {
  if (!isCalendarConfigured()) return null
  if (_client) return _client
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: normalizeKey(process.env.GOOGLE_SERVICE_ACCOUNT_KEY as string),
    scopes: SCOPES,
    // Domain-wide delegation: act as this Workspace user.
    subject: process.env.GOOGLE_IMPERSONATE_EMAIL,
  })
  _client = google.calendar({ version: "v3", auth })
  return _client
}

export type CalendarAttendee = { email: string; displayName?: string }

export type UpsertEventArgs = {
  /** Stable id we set on the event so the same row maps to the same event. */
  requestId: string
  summary: string
  description?: string
  start: Date
  durationMinutes: number
  attendees: CalendarAttendee[]
  /** All-day events (used for 360 cycle due dates) — date only, no time. */
  allDay?: boolean
}

export type CalendarEventResult = {
  eventId: string
  htmlLink: string | null
}

/**
 * Create or update an event on the shared calendar. Idempotent via the caller's
 * `requestId`: if an event already exists for it we patch in place, otherwise we
 * insert. Returns the Google event id + link, or null if calendar isn't set up
 * (caller should fall back to .ics email).
 */
export async function upsertCalendarEvent(
  args: UpsertEventArgs,
  existingEventId?: string | null,
): Promise<CalendarEventResult | null> {
  const cal = calendarClient()
  if (!cal) return null

  const end = new Date(args.start.getTime() + args.durationMinutes * 60_000)
  const requestBody: calendar_v3.Schema$Event = {
    summary: args.summary,
    description: args.description,
    attendees: args.attendees.map((a) => ({ email: a.email, displayName: a.displayName })),
    // Helps clients dedupe and lets us correlate on read.
    extendedProperties: { private: { ltzRequestId: args.requestId } },
    reminders: { useDefault: true },
  }
  if (args.allDay) {
    const day = args.start.toISOString().slice(0, 10)
    const nextDay = new Date(args.start.getTime() + 864e5).toISOString().slice(0, 10)
    requestBody.start = { date: day }
    requestBody.end = { date: nextDay }
  } else {
    requestBody.start = { dateTime: args.start.toISOString(), timeZone: "Europe/London" }
    requestBody.end = { dateTime: end.toISOString(), timeZone: "Europe/London" }
  }

  const params = {
    calendarId: calendarId(),
    sendUpdates: "all" as const, // email the attendees so they can accept in Google
  }

  if (existingEventId) {
    const res = await cal.events.patch({
      ...params,
      eventId: existingEventId,
      requestBody,
    })
    return { eventId: res.data.id as string, htmlLink: res.data.htmlLink ?? null }
  }

  const res = await cal.events.insert({ ...params, requestBody })
  return { eventId: res.data.id as string, htmlLink: res.data.htmlLink ?? null }
}

/** Cancel/delete an event on the shared calendar (notifies attendees). */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const cal = calendarClient()
  if (!cal) return
  try {
    await cal.events.delete({
      calendarId: calendarId(),
      eventId,
      sendUpdates: "all",
    })
  } catch {
    // Already gone — ignore.
  }
}

/** Normalized RSVP rollup for an event. */
export type RsvpStatus = "accepted" | "declined" | "tentative" | "needsAction" | "unknown"

export type EventRsvp = {
  /** Worst-case-aware overall status across the human attendees. */
  overall: RsvpStatus
  perAttendee: { email: string; status: RsvpStatus }[]
}

/**
 * Read back the RSVP state of an event. Used by the poll-back sync so the app
 * reflects accept/decline made in Google Calendar.
 */
export async function getEventRsvp(eventId: string): Promise<EventRsvp | null> {
  const cal = calendarClient()
  if (!cal) return null
  try {
    const res = await cal.events.get({ calendarId: calendarId(), eventId })
    const attendees = res.data.attendees ?? []
    const perAttendee = attendees
      .filter((a) => !a.resource && !a.organizer)
      .map((a) => ({
        email: (a.email ?? "").toLowerCase(),
        status: (a.responseStatus as RsvpStatus) ?? "needsAction",
      }))
    return { overall: rollupRsvp(perAttendee.map((a) => a.status)), perAttendee }
  } catch {
    return null
  }
}

/** Roll up multiple attendee responses into one headline status. */
function rollupRsvp(statuses: RsvpStatus[]): RsvpStatus {
  if (statuses.length === 0) return "unknown"
  if (statuses.includes("declined")) return "declined"
  if (statuses.every((s) => s === "accepted")) return "accepted"
  if (statuses.some((s) => s === "accepted" || s === "tentative")) return "tentative"
  return "needsAction"
}
