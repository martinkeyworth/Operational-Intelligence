import { OWNER_EMAILS } from "@/lib/access-types"
import { sendEmail } from "@/lib/email"
import { buildIcs } from "@/lib/ics"
import { resolvedFrom } from "@/lib/email"
import { db } from "@/lib/db"
import { barbers, oneToOnes, user as userTable, threeSixtyCycles, threeSixtyNominees } from "@/lib/db/schema"
import { and, desc, eq, isNull, isNotNull } from "drizzle-orm"
import { PBC_BANDS, formatPeriod } from "@/lib/learning-types"

const APP_NAME = "Less Than Zero"

/** Leadership recipients for HR notifications (owners + HR director). */
function leadershipRecipients(): string[] {
  const set = new Set<string>(OWNER_EMAILS.map((e) => e.toLowerCase()))
  set.add("luke@lessthanzerobarbers.com") // HR Director
  return Array.from(set)
}

/** Absolute base URL for links inside emails. Prefers the configured auth URL
 *  (kept without trailing slash), falling back to the Vercel deployment URL. */
export function appBaseUrl(): string {
  const raw =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://theltzgroup.com")
  return raw.replace(/\/+$/, "")
}

/** A styled call-to-action button for emails. */
export function emailButton(href: string, label: string): string {
  const url = href.startsWith("http") ? href : `${appBaseUrl()}${href.startsWith("/") ? "" : "/"}${href}`
  return `<a href="${url}" style="display:inline-block;margin-top:8px;padding:10px 18px;background:#111827;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">${label}</a>`
}

function pbcLabel(score: number | null | undefined): string {
  if (!score) return "—"
  return PBC_BANDS.find((b) => b.score === score)?.label ?? String(score)
}

export type OneToOnePeople = {
  barberId: number
  barberName: string
  barberEmail: string | null
  managerUserId: string | null
  managerName: string | null
  managerEmail: string | null
  active: boolean
  isApprentice: boolean
}

/** Resolve the barber + manager identities/emails for a 1-2-1. */
export async function resolveOneToOnePeople(barberId: number): Promise<OneToOnePeople | null> {
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  if (!barber) return null
  const barberEmail = barber.userId
    ? ((await db.select().from(userTable).where(eq(userTable.id, barber.userId)))[0]?.email ?? null)
    : null
  const manager = barber.managerUserId
    ? (await db.select().from(userTable).where(eq(userTable.id, barber.managerUserId)))[0]
    : null
  return {
    barberId: barber.id,
    barberName: barber.name,
    barberEmail,
    managerUserId: barber.managerUserId,
    managerName: manager?.name ?? null,
    managerEmail: manager?.email ?? null,
    active: barber.active,
    isApprentice: barber.isApprentice,
  }
}

/**
 * Send a set of distinct messages while guaranteeing NO address is emailed
 * twice. Each entry is {emails, subject, html, kind}; earlier entries win, so
 * put the most specific/relevant message first (e.g. the manager's action
 * message before the leadership escalation).
 */
async function sendDeduped(
  messages: { emails: (string | null | undefined)[]; subject: string; html: string; kind: string }[],
): Promise<number> {
  const seen = new Set<string>()
  let sent = 0
  for (const m of messages) {
    for (const raw of m.emails) {
      const to = raw?.trim().toLowerCase()
      if (!to || seen.has(to)) continue
      seen.add(to)
      await sendEmail({ to, subject: m.subject, html: m.html, kind: m.kind })
      sent++
    }
  }
  return sent
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
  nominees: { name: string; email: string; token?: string | null }[]
}): Promise<void> {
  const subject = `360 review request for ${args.barberName} (${args.period})`
  for (const n of args.nominees) {
    const link = n.token ? emailButton(`/360/${n.token}`, "Give your feedback") : ""
    const html = wrap(
      subject,
      `<p style="font-size:14px;line-height:1.6">Hi ${n.name},</p>
       <p style="font-size:14px;line-height:1.6">
         <strong>${args.barberName}</strong> has nominated you to provide 360 feedback
         for the ${args.period} review cycle. It only takes a couple of minutes and helps
         shape their development review. Please complete it by
         <strong>${args.dueOn}</strong>.</p>
       <p>${link}</p>`,
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

/**
 * Chase 360 reviewers who haven't responded on Open cycles. Idempotent per
 * nominee via reminded_at (only reminds those invited but not yet reminded and
 * not yet responded). Returns how many reminder emails were sent. Because the
 * 360 gates the 1-2-1, keeping responses flowing keeps reviews on schedule.
 */
export async function remindPendingReviewers(): Promise<number> {
  const rows = await db
    .select({
      nomineeId: threeSixtyNominees.id,
      name: threeSixtyNominees.name,
      email: threeSixtyNominees.email,
      token: threeSixtyNominees.token,
      period: threeSixtyCycles.period,
      dueOn: threeSixtyCycles.dueOn,
      barberId: threeSixtyCycles.barberId,
    })
    .from(threeSixtyNominees)
    .innerJoin(threeSixtyCycles, eq(threeSixtyNominees.cycleId, threeSixtyCycles.id))
    .where(
      and(
        eq(threeSixtyCycles.status, "Open"),
        isNull(threeSixtyNominees.respondedAt),
        isNull(threeSixtyNominees.remindedAt),
        isNotNull(threeSixtyNominees.invitedAt),
      ),
    )

  // Resolve barber names in one pass for nicer copy.
  const barberIds = Array.from(new Set(rows.map((r) => r.barberId)))
  const nameById = new Map<number, string>()
  for (const id of barberIds) {
    const [b] = await db.select({ name: barbers.name }).from(barbers).where(eq(barbers.id, id)).limit(1)
    if (b) nameById.set(id, b.name)
  }

  let sent = 0
  for (const r of rows) {
    if (!r.token) continue
    const barberName = nameById.get(r.barberId) ?? "your colleague"
    const subject = `Reminder: 360 feedback for ${barberName} (${r.period})`
    const html = wrap(
      subject,
      `<p style="font-size:14px;line-height:1.6">Hi ${r.name},</p>
       <p style="font-size:14px;line-height:1.6">
         Just a nudge to share your 360 feedback for <strong>${barberName}</strong>
         (${r.period})${r.dueOn ? `, due <strong>${r.dueOn}</strong>` : ""}. It only takes
         a couple of minutes and feeds directly into their development review.</p>
       <p>${emailButton(`/360/${r.token}`, "Give your feedback")}</p>`,
    )
    await sendEmail({ to: r.email, subject, html, kind: "team-360-reminder" })
    await db
      .update(threeSixtyNominees)
      .set({ remindedAt: new Date() })
      .where(eq(threeSixtyNominees.id, r.nomineeId))
    sent++
  }
  return sent
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

// --- Monthly 1-2-1 reminders / overdue / completion ------------------------

/**
 * Reminder that a monthly 1-2-1 is due. ONE email to the manager and ONE to the
 * barber — no duplicates even if the same person somehow fills both addresses.
 * Manager and barber each get a link to the right place to act.
 */
export async function sendOneToOneReminder(args: {
  barberId: number
  period: string
  dueOn?: string | null
}): Promise<number> {
  const people = await resolveOneToOnePeople(args.barberId)
  if (!people) return 0
  const periodLabel = formatPeriod(args.period)
  const due = args.dueOn ? ` (due ${args.dueOn})` : ""

  const managerHtml = wrap(
    `1-2-1 due: ${people.barberName}`,
    `<p style="font-size:14px;line-height:1.6">The monthly 1-2-1 with <strong>${people.barberName}</strong>
       for ${periodLabel} is due${due}.</p>
     <p style="font-size:14px;line-height:1.6">Review their self-prep, score PBC and complete it here:</p>
     <p>${emailButton(`/learning/plans/${people.barberId}`, "Open the 1-2-1")}</p>`,
  )
  const barberHtml = wrap(
    `Your 1-2-1 is due: ${periodLabel}`,
    `<p style="font-size:14px;line-height:1.6">Hi ${people.barberName.split(" ")[0]}, your monthly 1-2-1
       for ${periodLabel} is coming up${due}.</p>
     <p style="font-size:14px;line-height:1.6">Please complete your self-prep and self-assessment first:</p>
     <p>${emailButton(`/team`, "Complete your self-prep")}</p>`,
  )

  return sendDeduped([
    { emails: [people.managerEmail], subject: `1-2-1 due: ${people.barberName} (${periodLabel})`, html: managerHtml, kind: "team-1-2-1-reminder" },
    { emails: [people.barberEmail], subject: `Your 1-2-1 is due (${periodLabel})`, html: barberHtml, kind: "team-1-2-1-reminder" },
  ])
}

/**
 * Overdue escalation. The manager and barber get ONE "action needed" email
 * each; leadership get ONE escalation email — but anyone already emailed as
 * manager/barber is NOT emailed again. This fixes the previous double-email
 * where a manager who is also an owner received two messages.
 */
export async function sendOneToOneOverdue(args: {
  barberId: number
  period: string
  dueOn?: string | null
}): Promise<number> {
  const people = await resolveOneToOnePeople(args.barberId)
  if (!people) return 0
  const periodLabel = formatPeriod(args.period)
  const due = args.dueOn ? ` (was due ${args.dueOn})` : ""

  const managerHtml = wrap(
    `Overdue 1-2-1: ${people.barberName}`,
    `<p style="font-size:14px;line-height:1.6">The ${periodLabel} 1-2-1 with
       <strong>${people.barberName}</strong> is <strong>overdue</strong>${due}.</p>
     <p>${emailButton(`/learning/plans/${people.barberId}`, "Complete it now")}</p>`,
  )
  const barberHtml = wrap(
    `Your 1-2-1 is overdue`,
    `<p style="font-size:14px;line-height:1.6">Hi ${people.barberName.split(" ")[0]}, your ${periodLabel}
       1-2-1 is overdue${due}. If you haven't done your self-prep yet, please complete it:</p>
     <p>${emailButton(`/team`, "Complete your self-prep")}</p>`,
  )
  const leadershipHtml = wrap(
    `Escalation: overdue 1-2-1 for ${people.barberName}`,
    `<p style="font-size:14px;line-height:1.6">The ${periodLabel} 1-2-1 for
       <strong>${people.barberName}</strong> (manager: ${people.managerName ?? "unassigned"}) is overdue${due}
       and has been escalated.</p>
     <p>${emailButton(`/learning/plans/${people.barberId}`, "View the 1-2-1")}</p>`,
  )

  // Order matters: manager + barber first so they're never re-emailed by the
  // leadership escalation.
  return sendDeduped([
    { emails: [people.managerEmail], subject: `Overdue 1-2-1: ${people.barberName}`, html: managerHtml, kind: "team-1-2-1-overdue" },
    { emails: [people.barberEmail], subject: `Your 1-2-1 is overdue (${periodLabel})`, html: barberHtml, kind: "team-1-2-1-overdue" },
    { emails: leadershipRecipients(), subject: `Escalation: overdue 1-2-1 — ${people.barberName}`, html: leadershipHtml, kind: "team-1-2-1-overdue-escalation" },
  ])
}

/**
 * Completion email — sent to the barber AND their manager once a 1-2-1 is
 * completed. Includes the PBC scores, summary and agreed actions, plus a link
 * to the completed record. Deduped so nobody gets two copies.
 */
export async function sendOneToOneComplete(args: {
  barberId: number
  performance: number
  behaviours: number
  contribution: number
  overall: number
  summary?: string | null
  actions?: string | null
}): Promise<number> {
  const people = await resolveOneToOnePeople(args.barberId)
  if (!people) return 0

  const scoreRow = (label: string, score: number) =>
    `<tr>
       <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px">${label}</td>
       <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px;text-align:center;font-weight:600">${score}</td>
       <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;color:#666">${pbcLabel(score)}</td>
     </tr>`

  const scoresTable = `
    <table style="width:100%;border-collapse:collapse;margin:8px 0 16px">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 10px;font-size:12px;color:#888;text-transform:uppercase">Dimension</th>
          <th style="text-align:center;padding:6px 10px;font-size:12px;color:#888;text-transform:uppercase">Score</th>
          <th style="text-align:left;padding:6px 10px;font-size:12px;color:#888;text-transform:uppercase">Band</th>
        </tr>
      </thead>
      <tbody>
        ${scoreRow("Performance", args.performance)}
        ${scoreRow("Behaviours", args.behaviours)}
        ${scoreRow("Contribution", args.contribution)}
        ${scoreRow("Overall", args.overall)}
      </tbody>
    </table>`

  const body = (forBarber: boolean) =>
    wrap(
      `1-2-1 complete: ${people.barberName}`,
      `<p style="font-size:14px;line-height:1.6">${
        forBarber ? `Hi ${people.barberName.split(" ")[0]}, your` : `The`
      } monthly 1-2-1 ${forBarber ? "" : `with <strong>${people.barberName}</strong> `}has been completed.
       Your PBC scores (1 best – 5 lowest):</p>
       ${scoresTable}
       ${args.summary ? `<p style="font-size:14px;line-height:1.6"><strong>Summary:</strong> ${args.summary}</p>` : ""}
       ${args.actions ? `<p style="font-size:14px;line-height:1.6"><strong>Agreed actions:</strong> ${args.actions}</p>` : ""}
       <p>${emailButton(forBarber ? `/team` : `/learning/plans/${people.barberId}`, "View the completed 1-2-1")}</p>`,
    )

  return sendDeduped([
    { emails: [people.barberEmail], subject: `Your 1-2-1 is complete`, html: body(true), kind: "team-1-2-1-complete" },
    { emails: [people.managerEmail], subject: `1-2-1 complete: ${people.barberName}`, html: body(false), kind: "team-1-2-1-complete" },
  ])
}

/**
 * "Get well" acknowledgement to a barber who just logged sickness. If they run
 * their own column (active, non-apprentice) it also nudges them to arrange
 * cover. This is separate from the leadership sickness notification.
 */
export async function sendSicknessAckToIndividual(args: {
  toEmail: string | null | undefined
  firstName: string
  hasColumn: boolean
  start: string
  end: string
  days: number
}): Promise<void> {
  if (!args.toEmail) return
  const html = wrap(
    "Get well soon",
    `<p style="font-size:14px;line-height:1.6">Hi ${args.firstName}, we've logged your sickness absence
       (${args.start} → ${args.end}, ${args.days} day${args.days === 1 ? "" : "s"}). Rest up and focus on
       getting better.</p>
     ${
       args.hasColumn
         ? `<p style="font-size:14px;line-height:1.6">As you run your own column, please arrange cover or
             contact your clients where you can. You can manage this from your Team Area:</p>
            <p>${emailButton(`/team`, "Manage my column")}</p>`
         : ""
     }`,
  )
  await sendEmail({ to: args.toEmail, subject: "Get well soon", html, kind: "team-sickness-self" })
}

// --- Scheduler entry points (called by the cron) ---------------------------

/** Send reminders for 1-2-1s due within `withinDays` that haven't been
 *  reminded yet. Idempotent via reminderSentAt. Returns count reminded. */
export async function remindDueOneToOnes(withinDays = 2): Promise<number> {
  const rows = await db
    .select()
    .from(oneToOnes)
    .where(and(eq(oneToOnes.status, "Scheduled")))
    .orderBy(desc(oneToOnes.scheduledFor))
  const now = Date.now()
  let reminded = 0
  for (const o of rows) {
    if (o.reminderSentAt) continue
    if (!o.dueOn) continue
    const dueMs = new Date(o.dueOn).getTime()
    const daysToDue = (dueMs - now) / 864e5
    if (daysToDue > withinDays) continue // not close enough yet
    if (daysToDue < 0) continue // overdue handled separately
    try {
      await sendOneToOneReminder({ barberId: o.barberId, period: o.period ?? "", dueOn: o.dueOn })
      await db.update(oneToOnes).set({ reminderSentAt: new Date() }).where(eq(oneToOnes.id, o.id))
      reminded++
    } catch (e) {
      console.log("[v0] remindDueOneToOnes failed for", o.id, (e as Error).message)
    }
  }
  return reminded
}

/** Escalate overdue, still-open 1-2-1s once each (idempotent via
 *  overdueEscalatedAt). Returns count escalated. */
export async function escalateOverdueOneToOnes(now = new Date()): Promise<number> {
  const rows = await db
    .select()
    .from(oneToOnes)
    .where(and(eq(oneToOnes.status, "Scheduled")))
  let escalated = 0
  for (const o of rows) {
    if (o.overdueEscalatedAt) continue
    if (!o.dueOn) continue
    if (new Date(o.dueOn).getTime() >= now.getTime()) continue // not overdue
    try {
      await sendOneToOneOverdue({ barberId: o.barberId, period: o.period ?? "", dueOn: o.dueOn })
      await db.update(oneToOnes).set({ overdueEscalatedAt: new Date() }).where(eq(oneToOnes.id, o.id))
      escalated++
    } catch (e) {
      console.log("[v0] escalateOverdueOneToOnes failed for", o.id, (e as Error).message)
    }
  }
  return escalated
}
