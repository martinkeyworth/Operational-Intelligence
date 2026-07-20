import { NextResponse } from "next/server"
import {
  autoScheduleOneToOnes,
  autoOpenThreeSixtyCycles,
  syncOneToOneRsvps,
} from "@/lib/team-schedule"
import { remindDueOneToOnes, escalateOverdueOneToOnes, remindPendingReviewers } from "@/lib/team-notify"
import { isOutboundHold } from "@/lib/outbound-hold"
import { isCommEnabled } from "@/lib/comms"

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
