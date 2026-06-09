// Client-safe .ics (iCalendar) generation. No server/database imports so it can
// be unit-tested and reused anywhere. Produces a VEVENT that Google Workspace,
// Apple Calendar and Outlook all understand when attached to / embedded in an
// email (METHOD:REQUEST makes it an invite the recipient can accept).

export type IcsEvent = {
  uid: string
  title: string
  description?: string
  start: Date
  durationMinutes?: number
  organizerName?: string
  organizerEmail?: string
  attendees?: { name?: string; email: string }[]
  location?: string
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** Format a Date as a UTC iCal timestamp, e.g. 20260115T140000Z. */
function toIcsUtc(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  )
}

/** Escape text per RFC 5545 (commas, semicolons, backslashes, newlines). */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/** Build a complete .ics document (single VEVENT, METHOD:REQUEST). */
export function buildIcs(event: IcsEvent): string {
  const duration = event.durationMinutes ?? 30
  const end = new Date(event.start.getTime() + duration * 60 * 1000)
  const now = new Date()

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Less Than Zero//Team Area//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${esc(event.title)}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`)
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`)
  if (event.organizerEmail) {
    const cn = event.organizerName ? `;CN=${esc(event.organizerName)}` : ""
    lines.push(`ORGANIZER${cn}:mailto:${event.organizerEmail}`)
  }
  for (const a of event.attendees ?? []) {
    const cn = a.name ? `;CN=${esc(a.name)}` : ""
    lines.push(
      `ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`,
    )
  }
  lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR")
  // RFC 5545 wants CRLF line endings.
  return lines.join("\r\n")
}

/** Convenience: a data URI a link can use to download the invite. */
export function icsDataUri(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
}
