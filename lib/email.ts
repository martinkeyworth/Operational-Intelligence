import "server-only"
import { Resend } from "resend"
import { db } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"

// Sending via Resend (https://resend.com).
// Required env var:
//   RESEND_API_KEY  - API key from the Resend dashboard.
// Optional:
//   EMAIL_FROM      - From header, e.g. "Less Than Zero <reports@lessthanzerobarbers.com>".
//                     The domain MUST be verified in Resend. Until you verify
//                     lessthanzerobarbers.com, we fall back to Resend's shared
//                     onboarding@resend.dev sender, which only delivers to the
//                     email address that owns the Resend account.
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM || "Less Than Zero <onboarding@resend.dev>"

let _resend: Resend | null = null
function client(): Resend | null {
  if (!RESEND_API_KEY) return null
  if (_resend) return _resend
  _resend = new Resend(RESEND_API_KEY)
  return _resend
}

export type SendArgs = {
  to: string
  subject: string
  html: string
  kind: string
  weekEnding?: string | null
}

/** Send a single email via Resend and log the outcome. Never throws —
 *  returns ok/false so the batching workflow can continue on individual
 *  failures. */
export async function sendEmail({
  to,
  subject,
  html,
  kind,
  weekEnding = null,
}: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const resend = client()
  if (!resend) {
    const error = "Email not configured (RESEND_API_KEY is not set)"
    await logEmail({ kind, recipient: to, subject, weekEnding, status: "failed", error })
    return { ok: false, error }
  }

  try {
    const { error: sendError } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    })
    if (sendError) {
      const error = sendError.message || "Resend rejected the message"
      await logEmail({ kind, recipient: to, subject, weekEnding, status: "failed", error })
      return { ok: false, error }
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
