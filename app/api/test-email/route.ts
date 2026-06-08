import { NextResponse } from "next/server"
import { sendEmail, emailShell } from "@/lib/email"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * One-off test sender to confirm Resend email is wired up correctly.
 *
 * Usage (after deploying):
 *   /api/test-email?secret=<CRON_SECRET>&to=you@example.com
 *
 * Protected by CRON_SECRET so it can't be triggered by random visitors.
 * Returns { ok, error } so you can see exactly what Resend said if it fails.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const secret = process.env.CRON_SECRET
  if (secret) {
    const provided = searchParams.get("secret")
    const auth = req.headers.get("authorization")
    if (provided !== secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const to = searchParams.get("to") || ""
  if (!to) {
    return NextResponse.json(
      { error: "No recipient. Pass ?to=you@example.com" },
      { status: 400 },
    )
  }

  const html = emailShell(
    "Test email",
    `<p style="margin:0 0 12px;">If you can read this, the Less Than Zero dashboard can send email successfully.</p>
     <p style="margin:0;color:#6b7280;">You can safely ignore this message.</p>`,
  )

  const res = await sendEmail({
    to,
    subject: "Less Than Zero — email test",
    html,
    kind: "test",
    weekEnding: null,
  })

  return NextResponse.json({
    ...res,
    to,
    from: process.env.EMAIL_FROM || "onboarding@resend.dev",
    configured: Boolean(process.env.RESEND_API_KEY),
  })
}
