import "server-only"
import nodemailer, { type Transporter } from "nodemailer"
import { db } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"

// Sending via Gmail / Google Workspace using OAuth2 (no app password needed).
// Required env vars:
//   GMAIL_USER                  - the mailbox to send as, e.g.
//                                 "martin@lessthanzerobarbers.com"
//   GMAIL_OAUTH_CLIENT_ID       - OAuth client ID from Google Cloud Console
//   GMAIL_OAUTH_CLIENT_SECRET   - OAuth client secret
//   GMAIL_OAUTH_REFRESH_TOKEN   - long-lived refresh token authorised for the
//                                 https://mail.google.com/ scope
// Optional:
//   EMAIL_FROM                  - display From header. Defaults to GMAIL_USER.
//                                 Must be the GMAIL_USER address or a verified
//                                 Workspace alias/send-as.
const GMAIL_USER = process.env.GMAIL_USER
const OAUTH_CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID
const OAUTH_CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET
const OAUTH_REFRESH_TOKEN = process.env.GMAIL_OAUTH_REFRESH_TOKEN
const FROM =
  process.env.EMAIL_FROM ||
  (GMAIL_USER ? `Less Than Zero <${GMAIL_USER}>` : "")

let _transporter: Transporter | null = null
function transporter(): Transporter | null {
  if (
    !GMAIL_USER ||
    !OAUTH_CLIENT_ID ||
    !OAUTH_CLIENT_SECRET ||
    !OAUTH_REFRESH_TOKEN
  ) {
    return null
  }
  if (_transporter) return _transporter
  _transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      // nodemailer mints short-lived access tokens from the refresh token,
      // so we never store/expire an access token ourselves.
      type: "OAuth2",
      user: GMAIL_USER,
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
      refreshToken: OAUTH_REFRESH_TOKEN,
    },
  })
  return _transporter
}

export type SendArgs = {
  to: string
  subject: string
  html: string
  kind: string
  weekEnding?: string | null
}

/** Send a single email via Google Workspace SMTP and log the outcome. Never
 *  throws — returns ok/false so the batching workflow can continue on
 *  individual failures. */
export async function sendEmail({
  to,
  subject,
  html,
  kind,
  weekEnding = null,
}: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const tx = transporter()
  if (!tx) {
    const error =
      "Gmail OAuth2 not configured (need GMAIL_USER, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN)"
    await logEmail({ kind, recipient: to, subject, weekEnding, status: "failed", error })
    return { ok: false, error }
  }

  try {
    await tx.sendMail({ from: FROM, to, subject, html })
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
