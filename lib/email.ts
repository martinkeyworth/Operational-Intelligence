import "server-only"
import { Resend } from "resend"
import { db } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"

// Sending via Resend (https://resend.com).
// Required env var:
//   RESEND_API_KEY  - API key from the Resend dashboard (must belong to the
//                     team where theltzgroup.com is verified).
// Optional:
//   EMAIL_FROM      - Override the From header, e.g. "Less Than Zero <reports@theltzgroup.com>".
//                     The domain MUST be verified in Resend. When unset, we use
//                     DEFAULT_FROM below, which is on the already-verified
//                     theltzgroup.com domain so delivery to any recipient works
//                     without depending on an env var being present.
const RESEND_API_KEY = process.env.RESEND_API_KEY

// theltzgroup.com is verified in Resend, so this default lets the app send to
// anyone even if EMAIL_FROM is not configured in a given environment.
const VERIFIED_DOMAIN = "theltzgroup.com"
const DEFAULT_FROM = `Less Than Zero <noreply@${VERIFIED_DOMAIN}>`

/** Normalize the EMAIL_FROM value so common copy/paste issues (esp. from
 *  mobile keyboards) don't produce an invalid Resend `from` header:
 *   - trim whitespace / stray newlines
 *   - strip wrapping single or double quotes
 *   - replace curly quotes/brackets with plain ASCII < > " '
 *   - collapse internal whitespace
 *  Falls back to the verified-domain DEFAULT_FROM if the result is missing,
 *  invalid, or not on the verified sending domain. */
function normalizeFrom(raw: string | undefined): string {
  const fallback = DEFAULT_FROM
  if (!raw) return fallback
  // Normalize unicode look-alikes and whitespace that mobile keyboards inject.
  let v = raw
    .replace(/[\u201C\u201D]/g, '"') // “ ” -> "
    .replace(/[\u2018\u2019]/g, "'") // ‘ ’ -> '
    .replace(/[\u2039\u3008\uFF1C]/g, "<") // ‹ 〈 ＜ -> <
    .replace(/[\u203A\u3009\uFF1E]/g, ">") // › 〉 ＞ -> >
    .replace(/[\u00A0\u2007\u202F]/g, " ") // non-breaking spaces -> normal space
    .replace(/\s+/g, " ")
    .trim()
  // strip a single pair of wrapping quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim()
  }

  // Extract the first plausible email address anywhere in the string.
  const emailMatch = v.match(/[^\s<>@"]+@[^\s<>@"]+\.[^\s<>@"]+/)
  if (!emailMatch) return fallback
  const email = emailMatch[0].toLowerCase()

  // Derive the display name = whatever precedes the email / angle bracket.
  let name = v
    .slice(0, v.indexOf(emailMatch[0]))
    .replace(/[<>"']/g, "")
    .trim()
  if (!name) name = "Less Than Zero"
  // Strip characters that aren't valid unquoted in a display name.
  name = name.replace(/[",;:<>@\\]/g, "").trim()

  // Rebuild a guaranteed-valid RFC 5322 `Name <email>` header.
  const rebuilt = `${name} <${email}>`

  // Guard: only trust EMAIL_FROM if it's on the verified sending domain.
  // Any other domain (e.g. a stale lessthanzerobarbers.com value) would be
  // rejected by Resend for all recipients except the account owner, so we
  // force the known-verified default instead.
  if (!email.endsWith("@" + VERIFIED_DOMAIN)) return fallback

  return rebuilt
}

const FROM = normalizeFrom(process.env.EMAIL_FROM)

/** The exact, normalized `from` header the app will hand to Resend. */
export function resolvedFrom(): string {
  return FROM
}

let _resend: Resend | null = null
function client(): Resend | null {
  if (!RESEND_API_KEY) return null
  if (_resend) return _resend
  _resend = new Resend(RESEND_API_KEY)
  return _resend
}

export type SendArgs = {
  to: string
  // Optional carbon-copy recipient(s), e.g. copying leadership on a coaching
  // email. Logged as part of the recipient string.
  cc?: string | string[]
  subject: string
  html: string
  kind: string
  weekEnding?: string | null
  // Optional file attachments (e.g. a .ics calendar invite). `content` is the
  // raw file content as a string; Resend accepts a Buffer/string here.
  attachments?: { filename: string; content: string; contentType?: string }[]
}

/** Send a single email via Resend and log the outcome. Never throws —
 *  returns ok/false so the batching workflow can continue on individual
 *  failures. */
export async function sendEmail({
  to,
  cc,
  subject,
  html,
  kind,
  weekEnding = null,
  attachments,
}: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const ccList = cc ? (Array.isArray(cc) ? cc : [cc]).filter(Boolean) : []
  // Recorded recipient string for the audit log (includes any cc).
  const recipientLabel = ccList.length ? `${to} (cc: ${ccList.join(", ")})` : to
  const resend = client()
  if (!resend) {
    const error = "Email not configured (RESEND_API_KEY is not set)"
    await logEmail({ kind, recipient: recipientLabel, subject, weekEnding, status: "failed", error })
    return { ok: false, error }
  }

  try {
    const { error: sendError } = await resend.emails.send({
      from: FROM,
      to,
      ...(ccList.length ? { cc: ccList } : {}),
      subject,
      html,
      ...(attachments && attachments.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, "utf-8"),
              contentType: a.contentType,
            })),
          }
        : {}),
    })
    if (sendError) {
      const error = sendError.message || "Resend rejected the message"
      await logEmail({ kind, recipient: recipientLabel, subject, weekEnding, status: "failed", error })
      return { ok: false, error }
    }
    await logEmail({ kind, recipient: recipientLabel, subject, weekEnding, status: "sent" })
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown send error"
    await logEmail({ kind, recipient: recipientLabel, subject, weekEnding, status: "failed", error })
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
