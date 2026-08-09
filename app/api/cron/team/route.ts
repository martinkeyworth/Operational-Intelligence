import { NextResponse } from "next/server"
import {
  autoScheduleOneToOnes,
  autoOpenThreeSixtyCycles,
  syncOneToOneRsvps,
} from "@/lib/team-schedule"
import {
  remindDueOneToOnes,
  escalateOverdueOneToOnes,
  remindPendingReviewers,
  sendHolidayLookaheadEmail,
} from "@/lib/team-notify"
import { getApprovedHolidaysInRange } from "@/lib/team"
import { OWNER_EMAILS, OPS_MEETING_CHAIR_EMAIL } from "@/lib/access-types"
import { isOutboundHold } from "@/lib/outbound-hold"
import { isCommEnabled } from "@/lib/comms"

/** True when `now` (a Saturday) is the LAST Saturday of its month — i.e. adding
 *  a week lands in the next month. Cron can't express "last Saturday", so the
 *  digest runs every Saturday evening and this gate lets only the last one fire. */
function isLastSaturdayOfMonth(now: Date): boolean {
  const plus7 = new Date(now)
  plus7.setUTCDate(now.getUTCDate() + 7)
  return plus7.getUTCMonth() !== now.getUTCMonth()
}

/** First → last day of the month AFTER `now`, plus a "September 2026" label. */
function comingMonthRange(now: Date): { start: string; end: string; label: string } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const first = new Date(Date.UTC(y, m + 1, 1))
  const last = new Date(Date.UTC(y, m + 2, 0))
  return {
    start: first.toISOString().slice(0, 10),
    end: last.toISOString().slice(0, 10),
    label: first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
  }
}

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Team Area scheduler. Triggered daily by Vercel Cron. Idempotent — it only
 * creates a 1-2-1 for barbers who haven't had one in ~28 days, opens at most one
 * 360 cycle per barber per month, and reminds each pending reviewer once, so
 * running it every day is safe.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We also accept
 * a manual ?secret= for testing.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    const provided = searchParams.get("secret")
    if (auth !== `Bearer ${secret}` && provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const step = searchParams.get("step")

  // --- Monthly "who's off next month" digest → Cosmin --------------------
  // Scheduled every Saturday 18:00; only fires on the LAST Saturday of the
  // month. Lists everyone with approved holiday in the COMING month.
  if (step === "holiday-lookahead") {
    if (isOutboundHold()) return NextResponse.json({ ok: true, step, held: true })
    const now = new Date()
    if (!isLastSaturdayOfMonth(now)) {
      return NextResponse.json({ ok: true, step, skipped: "not the last Saturday" })
    }
    const { start, end, label } = comingMonthRange(now)
    const rows = await getApprovedHolidaysInRange(start, end)
    const sent = await sendHolidayLookaheadEmail({
      recipients: [OPS_MEETING_CHAIR_EMAIL],
      subject: `Who's off in ${label}`,
      title: `Who's off in ${label}`,
      intro: `Advance notice of everyone with approved holiday next month (${label}), across all shops.`,
      rangeLabel: label,
      rows,
      kind: "team-holiday-lookahead",
    })
    return NextResponse.json({ ok: true, step, sent, bookings: rows.length, range: { start, end } })
  }

  // --- On-demand "who's off — rest of the year" → Martin + Cosmin --------
  // Not on a schedule; triggered manually. Every approved holiday from today
  // through 31 Dec of the current year.
  if (step === "holiday-schedule") {
    if (isOutboundHold()) return NextResponse.json({ ok: true, step, held: true })
    const now = new Date()
    const year = now.getUTCFullYear()
    const start = now.toISOString().slice(0, 10)
    const end = `${year}-12-31`
    const rows = await getApprovedHolidaysInRange(start, end)
    const sent = await sendHolidayLookaheadEmail({
      recipients: [...OWNER_EMAILS],
      subject: `Holiday booked — rest of ${year}`,
      title: `Who's off — rest of ${year}`,
      intro: `Here's every approved holiday booking between today and the end of ${year}, across all shops.`,
      rangeLabel: `Today → 31 Dec ${year}`,
      rows,
      kind: "team-holiday-schedule",
    })
    return NextResponse.json({ ok: true, step, sent, bookings: rows.length, range: { start, end } })
  }

  const held = isOutboundHold()
  // Scheduling + RSVP sync are record-keeping (not chase messages) so they keep
  // running; only the outbound reminders honour the hold + per-channel toggles.
  const threeSixtyOn = !held && (await isCommEnabled("three-sixty"))
  const oneToOneOn = !held && (await isCommEnabled("one-to-one"))

  try {
    const oneToOnes = await autoScheduleOneToOnes()
    const threeSixties = await autoOpenThreeSixtyCycles()
    // Chase 360 reviewers who haven't responded (the 360 gates the 1-2-1).
    const reviewerReminders = threeSixtyOn ? await remindPendingReviewers() : 0
    // Pull accept/decline responses back from Google Calendar so leadership
    // sees RSVP status in the app.
    const rsvpUpdates = await syncOneToOneRsvps()
    // 1-2-1 reminders (due soon) + overdue escalation. Both idempotent.
    const reminders = oneToOneOn ? await remindDueOneToOnes(2) : 0
    const overdue = oneToOneOn ? await escalateOverdueOneToOnes() : 0
    return NextResponse.json({
      ok: true,
      oneToOnes,
      threeSixties,
      reviewerReminders,
      rsvpUpdates,
      reminders,
      overdue,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
