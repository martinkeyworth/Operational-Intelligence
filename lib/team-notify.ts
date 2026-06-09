import { OWNER_EMAILS } from "@/lib/access-types"
import { sendEmail } from "@/lib/email"
import { buildIcs } from "@/lib/ics"
import { resolvedFrom } from "@/lib/email"

const APP_NAME = "Less Than Zero"

/** Leadership recipients for HR notifications (owners + HR director). */
function leadershipRecipients(): string[] {
  const set = new Set<string>(OWNER_EMAILS.map((e) => e.toLowerCase()))
  set.add("luke@lessthanzerobarbers.com") // HR Director
  return Array.from(set)
}

function wrap(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
    ${bodyHtml}
    <p style="font-size:12px;color:#888;margin-top:24px">Sent automatically by the ${APP_NAME} Team Area.</p>
  </div>`
}

/** Notify leadership when a barber requests holiday or logs sickness. */
export async function sendLeaveNotification(args: {
  kind: "holiday" | "sickness"
  barberName: string
  start: string
  end: string
  days: number
  reason?: string | null
}): Promise<void> {
  const label = args.kind === "holiday" ? "Holiday request" : "Sickness logged"
  const subject = `${label}: ${args.barberName} (${args.days} day${args.days === 1 ? "" : "s"})`
  const html = wrap(
    subject,
    `<p style="font-size:14px;line-height:1.6">
       <strong>${args.barberName}</strong> ${
         args.kind === "holiday" ? "has requested holiday" : "has logged sickness"
       }.</p>
     <ul style="font-size:14px;line-height:1.7">
       <li>Dates: ${args.start} → ${args.end}</li>
       <li>Days: ${args.days}</li>
       ${args.reason ? `<li>Note: ${args.reason}</li>` : ""}
     </ul>
     ${
       args.kind === "holiday"
         ? `<p style="font-size:14px">Approve or decline this in the Team Area.</p>`
         : ""
     }`,
  )

  for (const to of leadershipRecipients()) {
    await sendEmail({ to, subject, html, kind: `team-${args.kind}` })
  }
}

/** Email the 5 nominated reviewers their 360 review request. */
export async function sendThreeSixtyInvites(args: {
  barberName: string
  period: string
  dueOn: string
  nominees: { name: string; email: string }[]
}): Promise<void> {
  const subject = `360 review request for ${args.barberName} (${args.period})`
  for (const n of args.nominees) {
    const html = wrap(
      subject,
      `<p style="font-size:14px;line-height:1.6">Hi ${n.name},</p>
       <p style="font-size:14px;line-height:1.6">
         <strong>${args.barberName}</strong> has nominated you to provide 360 feedback
         for the ${args.period} review cycle. Please complete your feedback by
         <strong>${args.dueOn}</strong>.</p>`,
    )
    await sendEmail({ to: n.email, subject, html, kind: "team-360-invite" })
  }
  // Also let leadership know the cycle has gone out.
  const adminHtml = wrap(
    `360 nominees submitted: ${args.barberName}`,
    `<p style="font-size:14px">${args.barberName} submitted 5 nominees for the
     ${args.period} 360 cycle (due ${args.dueOn}).</p>`,
  )
  for (const to of leadershipRecipients()) {
    await sendEmail({
      to,
      subject: `360 cycle opened: ${args.barberName}`,
      html: adminHtml,
      kind: "team-360-admin",
    })
  }
}

/** Email a 1-2-1 calendar invite (.ics) to the barber + their manager. */
export async function sendOneToOneInvite(args: {
  oneToOneId: number
  barberName: string
  barberEmail?: string | null
  managerName?: string | null
  managerEmail?: string | null
  scheduledFor: Date
}): Promise<void> {
  const attendees = [
    args.barberEmail ? { name: args.barberName, email: args.barberEmail } : null,
    args.managerEmail
      ? { name: args.managerName ?? "Manager", email: args.managerEmail }
      : null,
  ].filter(Boolean) as { name: string; email: string }[]

  const ics = buildIcs({
    uid: `1-2-1-${args.oneToOneId}@lessthanzerobarbers.com`,
    title: `1-2-1: ${args.barberName}`,
    description: `Monthly 1-2-1 between ${args.barberName} and ${
      args.managerName ?? "their manager"
    }.`,
    start: args.scheduledFor,
    durationMinutes: 30,
    organizerName: APP_NAME,
    organizerEmail: resolvedFrom().replace(/.*<(.+)>.*/, "$1"),
    attendees,
  })

  const when = args.scheduledFor.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const subject = `1-2-1 scheduled: ${args.barberName} — ${when}`
  const html = wrap(
    subject,
    `<p style="font-size:14px;line-height:1.6">
       Your monthly 1-2-1 has been scheduled for <strong>${when}</strong>.
       Accept the attached calendar invite to add it to your calendar.</p>`,
  )

  const recipients = attendees.map((a) => a.email)
  for (const to of recipients) {
    await sendEmail({
      to,
      subject,
      html,
      kind: "team-1-2-1-invite",
      attachments: [
        { filename: "1-2-1.ics", content: ics, contentType: "text/calendar; method=REQUEST" },
      ],
    })
  }
}
