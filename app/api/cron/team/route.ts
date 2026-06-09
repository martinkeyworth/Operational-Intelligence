import { NextResponse } from "next/server"
import { autoScheduleOneToOnes, autoOpenThreeSixtyCycles } from "@/lib/team-schedule"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Team Area scheduler. Triggered daily by Vercel Cron. Idempotent — it only
 * creates a 1-2-1 for barbers who haven't had one in ~28 days, and only opens
 * a 360 cycle once per half-year, so running it every day is safe.
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

  try {
    const oneToOnes = await autoScheduleOneToOnes()
    const threeSixties = await autoOpenThreeSixtyCycles()
    return NextResponse.json({ ok: true, oneToOnes, threeSixties })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
