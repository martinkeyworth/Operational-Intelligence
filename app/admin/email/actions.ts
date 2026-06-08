"use server"

import { requireOwner } from "@/lib/access"
import { sendEmail } from "@/lib/email"

export type TestEmailResult = { ok: boolean; to?: string; error?: string }

/**
 * Owner-only: send a test email to the currently logged-in owner's own
 * address, using the live email configuration. Lets us confirm
 * end-to-end delivery from the deployed app without any secret or URL.
 */
export async function sendTestEmail(): Promise<TestEmailResult> {
  const owner = await requireOwner()

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111827;line-height:1.6;">
      <h2 style="margin:0 0 12px;font-size:18px;">Test email</h2>
      <p style="margin:0 0 12px;">This is a test from the Less Than Zero dashboard.</p>
      <p style="margin:0;color:#6b7280;">If you can read this, email delivery is working.</p>
    </div>`

  const res = await sendEmail({
    to: owner.email,
    subject: "Test email from Less Than Zero dashboard",
    html,
    kind: "test",
    weekEnding: null,
  })

  return { ok: res.ok, to: owner.email, error: res.error }
}

/**
 * Owner-only: send a test email to ANY address. Used to confirm that
 * delivery to team members (e.g. Cosmin) works now that the sending
 * domain is verified — not just delivery back to the owner.
 */
export async function sendTestEmailTo(
  to: string,
): Promise<TestEmailResult> {
  await requireOwner()

  const recipient = (to || "").trim()
  const looksValid = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)
  if (!looksValid) {
    return { ok: false, error: "Enter a valid email address (e.g. name@example.com)." }
  }

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111827;line-height:1.6;">
      <h2 style="margin:0 0 12px;font-size:18px;">Test email</h2>
      <p style="margin:0 0 12px;">This is a test from the Less Than Zero dashboard, sent to confirm delivery to your address.</p>
      <p style="margin:0;color:#6b7280;">If you can read this, you'll receive your reports and reminders here.</p>
    </div>`

  const res = await sendEmail({
    to: recipient,
    subject: "Test email from Less Than Zero dashboard",
    html,
    kind: "test",
    weekEnding: null,
  })

  return { ok: res.ok, to: recipient, error: res.error }
}
