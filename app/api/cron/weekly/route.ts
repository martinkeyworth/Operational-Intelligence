import { NextResponse } from "next/server"
import { STEPS, type StepName } from "@/lib/weekly-workflow"

export const dynamic = "force-dynamic"
export const maxDuration = 300

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

  try {
    const result = await STEPS[step]()
    return NextResponse.json({ ok: true, step, result })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, step, error: message }, { status: 500 })
  }
}
