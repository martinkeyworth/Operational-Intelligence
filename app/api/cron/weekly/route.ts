import { NextResponse } from "next/server"
import { STEPS, type StepName } from "@/lib/weekly-workflow"
import { isOutboundHold } from "@/lib/outbound-hold"
import { isCommEnabled, type CommKey } from "@/lib/comms"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Which /admin/comms channel controls each cron step. If the channel is paused,
// the step is skipped (200 no-op) so Vercel Cron records no failure.
const STEP_CHANNEL: Partial<Record<StepName, CommKey>> = {
  reminders: "weekly-reminders",
  cadence: "board-cadence",
  analysis: "board-cadence",
  "cosmin-narrative": "board-cadence",
  "board-report": "board-cadence",
  "martin-response": "board-cadence",
  "brand-rtb": "board-cadence",
  "submission-alert": "board-cadence",
  "confirmation-prompt": "board-cadence",
  "escalate-unconfirmed": "board-cadence",
  "red-action-reminders": "raid-reminders",
  escalate: "raid-reminders",
  "raid-ai-analysis": "raid-ai",
}

/**
 * Saturday reporting workflow runner. Triggered by Vercel Cron at the UK times
 * configured in vercel.json. Each schedule passes ?step=<name>.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We also accept
 * a manual ?secret= for testing.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const step = searchParams.get("step") as StepName | null

  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    const provided = searchParams.get("secret")
    if (auth !== `Bearer ${secret}` && provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  if (!step || !(step in STEPS)) {
    return NextResponse.json(
      { error: "Invalid step", valid: Object.keys(STEPS) },
      { status: 400 },
    )
  }

  // Temporary global hold: skip the entire weekend cadence + every automated
  // step (chasers, escalations, RAID-AI, team/360 reminders, board report).
  // Flip OUTBOUND_HOLD in project settings to resume. No-ops cleanly (200) so
  // Vercel Cron doesn't record failures while held.
  if (isOutboundHold()) {
    return NextResponse.json({ ok: true, step, held: true })
  }

  // Per-channel pause set from /admin/comms.
  const channel = STEP_CHANNEL[step]
  if (channel && !(await isCommEnabled(channel))) {
    return NextResponse.json({ ok: true, step, paused: channel })
  }

  try {
    const result = await STEPS[step]()
    return NextResponse.json({ ok: true, step, result })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, step, error: message }, { status: 500 })
  }
}
