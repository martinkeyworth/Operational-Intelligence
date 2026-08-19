import "dotenv/config"
import { Resend } from "resend"
import { Pool } from "pg"

// One-off: brief every active manager on the NEW automatic monthly 1-2-1 process
// — what changed, what they must do (and must NOT do), plus their own upcoming
// 1-2-1s. Sent from the owner so it's a real, replyable sender (not no-reply).
// Self-contained (does not import lib/email, which is server-only): sends via
// Resend directly and mirrors the email_log insert.
// Send from the verified theltzgroup.com domain (lessthanzerobarbers.com is not
// yet verified in Resend), keeping Martin's name, with Reply-To to his real
// mailbox so replies reach him.
const FROM = "Martin Wallis-Keyworth <noreply@theltzgroup.com>"
const REPLY_TO = "martin@lessthanzerobarbers.com"

function baseUrl(): string {
  const raw =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://theltzgroup.com")
  return raw.replace(/\/+$/, "")
}

function button(href: string, label: string): string {
  const url = href.startsWith("http") ? href : `${baseUrl()}${href.startsWith("/") ? "" : "/"}${href}`
  return `<a href="${url}" style="display:inline-block;margin-top:8px;padding:10px 18px;background:#111827;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">${label}</a>`
}

type Row = { barber: string; london_time: string }

function fmtList(rows: Row[]): string {
  if (rows.length === 0) {
    return `<p style="font-size:14px;margin:0 0 12px">You have no 1-2-1s scheduled right now — the system will book them automatically.</p>`
  }
  const items = rows
    .map((r) => `<li style="margin:0 0 6px"><strong>${r.barber}</strong> — ${r.london_time} (UK)</li>`)
    .join("")
  return `<ul style="font-size:14px;margin:0 0 12px;padding-left:18px">${items}</ul>`
}

function buildHtml(managerName: string, rows: Row[]): string {
  const plansUrl = `${baseUrl()}/learning/plans`
  return `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <h2 style="font-size:18px;margin:0 0 12px">Your monthly 1-2-1s are now automatic</h2>
    <p style="font-size:14px;margin:0 0 12px">Hi ${managerName.split(" ")[0]},</p>
    <p style="font-size:14px;margin:0 0 12px">We've changed how team 1-2-1s work so there's less admin for you. Here's what you need to know:</p>

    <h3 style="font-size:15px;margin:16px 0 6px">What happens automatically</h3>
    <ul style="font-size:14px;margin:0 0 12px;padding-left:18px">
      <li style="margin:0 0 6px">Every one of your team's 1-2-1s is now booked <strong>automatically each month</strong> — you don't need to schedule anything.</li>
      <li style="margin:0 0 6px">They're always set for <strong>9:00am or 9:30am UK time</strong>, and never clash with each other.</li>
      <li style="margin:0 0 6px">You and the team member both get a calendar invite, sent <strong>from you</strong>.</li>
    </ul>

    <h3 style="font-size:15px;margin:16px 0 6px">What you need to do</h3>
    <ul style="font-size:14px;margin:0 0 12px;padding-left:18px">
      <li style="margin:0 0 6px"><strong>To move a 1-2-1:</strong> do it <strong>in the app</strong> — go to Learning Plans, open the team member, and use <strong>"Move this 1-2-1"</strong> to pick a new date/time.</li>
      <li style="margin:0 0 6px"><strong>Please don't</strong> try to drag or delete the event inside Google Calendar — it won't let you (you're an attendee on a shared event), and it won't update the system. Always move it in the app.</li>
      <li style="margin:0 0 6px"><strong>To complete a 1-2-1:</strong> open it in the app afterwards and mark it complete with your notes.</li>
    </ul>

    <h3 style="font-size:15px;margin:16px 0 6px">Your upcoming 1-2-1s</h3>
    ${fmtList(rows)}

    <p style="margin:8px 0 4px">${button("/learning/plans", "Open Learning Plans")}</p>
    <p style="font-size:12px;color:#888;margin-top:8px">Or paste this link: ${plansUrl}</p>

    <p style="font-size:14px;margin:20px 0 0">Any questions, just reply to this email.</p>
    <p style="font-size:14px;margin:4px 0 0">Thanks,<br/>Martin</p>
    <p style="font-size:12px;color:#888;margin-top:24px">Sent from the Less Than Zero Team Area.</p>
  </div>`
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const resendKey = process.env.RESEND_API_KEY
  const resend = resendKey ? new Resend(resendKey) : null

  const managersRes = await pool.query<{
    manager_user_id: string
    manager_name: string
    manager_email: string
  }>(
    `SELECT DISTINCT mu.id AS manager_user_id, mu.name AS manager_name, mu.email AS manager_email
       FROM barbers b
       JOIN "user" mu ON mu.id = b.manager_user_id
      WHERE b.active = true AND b.manager_user_id IS NOT NULL
      ORDER BY mu.name`,
  )

  const subject = "Your monthly 1-2-1s are now automatic — quick guide"

  for (const m of managersRes.rows) {
    const otoRes = await pool.query<Row>(
      `SELECT b.name AS barber,
              to_char((o.scheduled_for AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London','Dy DD Mon HH24:MI') AS london_time
         FROM one_to_ones o
         JOIN barbers b ON b.id = o.barber_id
        WHERE o.manager_user_id = $1 AND o.status = 'Scheduled'
        ORDER BY o.scheduled_for`,
      [m.manager_user_id],
    )
    const html = buildHtml(m.manager_name, otoRes.rows)

    if (dryRun) {
      console.log(`[v0] DRY-RUN would email ${m.manager_email} (${otoRes.rows.length} 1-2-1s)`)
      continue
    }
    if (!resend) {
      console.log("[v0] RESEND_API_KEY not set — cannot send")
      break
    }

    let status = "sent"
    let error: string | null = null
    try {
      const { error: sendError } = await resend.emails.send({
        from: FROM,
        to: m.manager_email,
        replyTo: REPLY_TO,
        subject,
        html,
      })
      if (sendError) {
        status = "failed"
        error = sendError.message || "Resend rejected the message"
      }
    } catch (e) {
      status = "failed"
      error = e instanceof Error ? e.message : "Unknown send error"
    }

    await pool
      .query(
        `INSERT INTO email_log (kind, recipient, subject, week_ending, status, error)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        ["team-1-2-1-briefing", m.manager_email, subject, null, status, error],
      )
      .catch(() => {})

    console.log(`[v0] ${status.toUpperCase()} -> ${m.manager_email}${error ? " :: " + error : ""}`)
  }

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
