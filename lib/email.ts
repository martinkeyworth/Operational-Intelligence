import "server-only"
import { Resend } from "resend"
import { db } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"

// Default to Resend's shared test sender until the lessthanzerobarbers.com
// domain is verified in Resend, then set RESEND_FROM_EMAIL to
// "Less Than Zero <info@lessthanzerobarbers.com>".
const FROM =
  process.env.RESEND_FROM_EMAIL || "Less Than Zero <onboarding@resend.dev>"

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

export type SendArgs = {
  to: string
  subject: string
  html: string
  kind: string
  weekEnding?: string | null
}

/** Send a single email via Resend and log the outcome. Never throws — returns
 *  ok/false so the batching workflow can continue on individual failures. */
export async function sendEmail({
  to,
  subject,
  html,
  kind,
  weekEnding = null,
}: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const resend = client()
  if (!resend) {
    const error = "RESEND_API_KEY not set"
    await logEmail({ kind, recipient: to, subject, weekEnding, status: "failed", error })
    return { ok: false, error }
  }

  try {
    const res = await resend.emails.send({ from: FROM, to, subject, html })
    if (res.error) {
      await logEmail({
        kind,
        recipient: to,
        subject,
        weekEnding,
        status: "failed",
        error: res.error.message,
      })
      return { ok: false, error: res.error.message }
    }
    await logEmail({ kind, recipient: to, subject, weekEnding, status: "sent" })
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown send error"
    await logEmail({ kind, recipient: to, subject, weekEnding, status: "failed", error })
    return { ok: false, error }
  }
}

async function logEmail(row: {
  kind: string
  recipient: string
  subject: string
  weekEnding: string | null
  status: string
  error?: string
}) {
  try {
    await db.insert(emailLog).values({
      kind: row.kind,
      recipient: row.recipient,
      subject: row.subject,
      weekEnding: row.weekEnding,
      status: row.status,
      error: row.error ?? null,
    })
  } catch {
    // Logging must never break the send loop.
  }
}

/** Minimal, email-client-safe HTML shell (inline styles only). */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="background:#111827;padding:20px 24px;">
      <p style="margin:0;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.01em;">Less Than Zero</p>
      <p style="margin:2px 0 0;color:#9ca3af;font-size:12px;">${title}</p>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #e4e4e7;color:#9ca3af;font-size:11px;">
      Automated message from the LTZ Group governance dashboard.
    </div>
  </div>
</body></html>`
}

export function ragChip(rag: string): string {
  const map: Record<string, string> = {
    green: "#16a34a",
    amber: "#d97706",
    red: "#dc2626",
  }
  const color = map[rag] ?? "#6b7280"
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:${color};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;">${rag}</span>`
}
