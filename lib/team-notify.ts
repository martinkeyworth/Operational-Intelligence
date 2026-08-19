import { OWNER_EMAILS } from "@/lib/access-types"
import { sendEmail } from "@/lib/email"
import { buildIcs } from "@/lib/ics"
import { resolvedFrom } from "@/lib/email"
import { db } from "@/lib/db"
import { barbers, oneToOnes, user as userTable, threeSixtyCycles, threeSixtyNominees } from "@/lib/db/schema"
import { and, desc, eq, isNull, isNotNull } from "drizzle-orm"
import { PBC_BANDS, formatPeriod } from "@/lib/learning-types"
import { logAccountabilityMiss } from "@/lib/accountability"

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

/**
 * Notify on a holiday request or sickness log.
 *
 * HOLIDAY: the barber's assigned MANAGER is the approver — they get the action
 * email with a live "Review & decide" link; owners + HR get an FYI copy (never
 * double-emailed). Requests made with less than one month's notice are flagged
 * as an EXCEPTION (short notice) so the manager can apply discretion.
 *
 * SICKNESS: informational, goes to leadership as before.
 */
export async function sendLeaveNotification(args: {
  kind: "holiday" | "sickness"
  barberId: number
  barberName: string
  start: string
  end: string
  days: number
  reason?: string | null
  /** Days of notice given (request date → start date). Holiday only. */
  noticeDays?: number
  /** True when notice is under one month. Holiday only. */
  isException?: boolean
  /** Set when a holiday request was auto-declined for exceeding the site's
   *  concurrent time-off cap; carries the reason to show leadership. */
  autoDeclined?: boolean
  autoDeclineReason?: string | null
  }): Promise<void> {
  // --- Sickness: unchanged informational note to leadership ----------------
  if (args.kind === "sickness") {
    const subject = `Sickness logged: ${args.barberName} (${args.days} day${args.days === 1 ? "" : "s"})`
    const html = wrap(
      subject,
      `<p style="font-size:14px;line-height:1.6">
         <strong>${args.barberName}</strong> has logged sickness.</p>
       <ul style="font-size:14px;line-height:1.7">
         <li>Dates: ${args.start} → ${args.end}</li>
         <li>Days: ${args.days}</li>
         ${args.reason ? `<li>Note: ${args.reason}</li>` : ""}
       </ul>`,
    )
    for (const to of leadershipRecipients()) {
      await sendEmail({ to, subject, html, kind: "team-sickness" })
    }
    return
  }

  // --- Holiday: route the approval to the barber's manager -----------------
  const people = await resolveOneToOnePeople(args.barberId)
  const managerEmail = people?.managerEmail ?? null

  // Auto-declined for over-capacity: no approval needed, just an FYI to the
  // manager + leadership (they can still override in the Team Area).
  if (args.autoDeclined) {
    const subject = `Holiday auto-declined: ${args.barberName} (${args.days} day${args.days === 1 ? "" : "s"})`
    const html = wrap(
      subject,
      `<p style="font-size:14px;line-height:1.6">
         <strong>${args.barberName}</strong> requested holiday, but it was automatically declined.</p>
       <ul style="font-size:14px;line-height:1.7">
         <li>Dates: ${args.start} → ${args.end}</li>
         <li>Days: ${args.days}</li>
         ${args.reason ? `<li>Note: ${args.reason}</li>` : ""}
         ${args.autoDeclineReason ? `<li>Reason: ${args.autoDeclineReason}</li>` : ""}
       </ul>
       <p style="font-size:14px;line-height:1.6">No action needed — the request was declined because the site was already at its holiday capacity for those dates. You can still override this in the Team Area if you want to allow it.</p>
       <p>${emailButton(`/approvals`, "Open Team Area")}</p>`,
    )
    await sendDeduped([
      { emails: [managerEmail], subject, html, kind: "team-holiday" },
      { emails: leadershipRecipients(), subject, html, kind: "team-holiday" },
    ])
    return
  }

  const exception = Boolean(args.isException)
  const subject = exception
    ? `Holiday request — SHORT NOTICE: ${args.barberName} (${args.days} day${args.days === 1 ? "" : "s"})`
    : `Holiday request: ${args.barberName} (${args.days} day${args.days === 1 ? "" : "s"})`

  const exceptionBanner = exception
    ? `<p style="font-size:14px;line-height:1.6;padding:10px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;color:#92400e">
         <strong>Exception — short notice.</strong> This request gives
         ${typeof args.noticeDays === "number" ? `${args.noticeDays} day${args.noticeDays === 1 ? "" : "s"}` : "less than one month"}
         of notice (policy is one month). Approve only at your discretion.
       </p>`
    : ""

  const detailHtml = `
     ${exceptionBanner}
     <p style="font-size:14px;line-height:1.6">
       <strong>${args.barberName}</strong> has requested holiday.</p>
     <ul style="font-size:14px;line-height:1.7">
       <li>Dates: ${args.start} → ${args.end}</li>
       <li>Days: ${args.days}</li>
       ${typeof args.noticeDays === "number" ? `<li>Notice given: ${args.noticeDays} day${args.noticeDays === 1 ? "" : "s"}${exception ? " (under one month)" : ""}</li>` : ""}
       ${args.reason ? `<li>Note: ${args.reason}</li>` : ""}
     </ul>`

  // Link to the scoped /approvals page so a manager WITHOUT dashboard access
  // can still approve their own reports (/admin/team is dashboard-gated).
  const reviewButton = emailButton(`/approvals`, "Review & decide")

  // Manager gets the action email; owners + HR get an FYI copy. sendDeduped
  // guarantees nobody (e.g. a manager who is also an owner, like Cosmin) is
  // emailed twice. If no manager is assigned, owners become the approvers.
  const managerHtml = wrap(
    subject,
    `${detailHtml}
     <p style="font-size:14px;line-height:1.6">You are ${args.barberName}'s manager — please approve or decline.</p>
     <p>${reviewButton}</p>`,
  )
  const fyiHtml = wrap(
    subject,
    `${detailHtml}
     <p style="font-size:14px;line-height:1.6">${
       managerEmail
         ? `Sent to their manager${people?.managerName ? ` (${people.managerName})` : ""} to decide. FYI copy for leadership.`
         : "No manager is assigned — leadership can approve or decline."
     }</p>
     <p>${reviewButton}</p>`,
  )

  await sendDeduped([
    { emails: [managerEmail], subject, html: managerHtml, kind: "team-holiday" },
    { emails: leadershipRecipients(), subject, html: fyiHtml, kind: "team-holiday" },
  ])
}

/**
 * FYI to leadership (+ the barber's manager) that a holiday was cancelled or
 * its dates changed. Used when a barber cancels their own booking or rebooks
 * new dates, and when a manager cancels on their behalf. Best-effort; never
 * blocks the action.
 */
export async function sendHolidayCancellationNotice(args: {
  barberId: number
  barberName: string
  start: string
  end: string
  days: number
  /** True when the cancelled booking had already been approved. */
  wasApproved: boolean
  /** Who performed the action, for the message ("cancelled by …"). */
  byName?: string | null
  /** When rebooking, the new dates that were submitted for approval. */
  rebookedTo?: { start: string; end: string; days: number } | null
}): Promise<void> {
  const people = await resolveOneToOnePeople(args.barberId)
  const managerEmail = people?.managerEmail ?? null
  const rebooked = args.rebookedTo ?? null

  const subject = rebooked
    ? `Holiday changed: ${args.barberName}`
    : `Holiday cancelled: ${args.barberName} (${args.days} day${args.days === 1 ? "" : "s"})`

  const by = args.byName ? ` by ${args.byName}` : ""
  const lead = rebooked
    ? `<strong>${args.barberName}</strong>'s holiday has been changed${by}.`
    : `<strong>${args.barberName}</strong>'s ${args.wasApproved ? "approved " : ""}holiday has been cancelled${by}.`

  const html = wrap(
    subject,
    `<p style="font-size:14px;line-height:1.6">${lead}</p>
     <ul style="font-size:14px;line-height:1.7">
       <li>${rebooked ? "Was" : "Cancelled"}: ${args.start} → ${args.end} (${args.days} day${args.days === 1 ? "" : "s"})</li>
       ${rebooked ? `<li>New request: ${rebooked.start} → ${rebooked.end} (${rebooked.days} day${rebooked.days === 1 ? "" : "s"}) — awaiting approval</li>` : ""}
     </ul>
     <p style="font-size:14px;line-height:1.6">The holiday allowance and shop cover have been updated automatically${
       rebooked ? ", and the new dates need approving" : ""
     }.</p>
     <p>${emailButton(`/approvals`, "Open Team Area")}</p>`,
  )

  await sendDeduped([
    { emails: [managerEmail], subject, html, kind: "team-holiday" },
    { emails: leadershipRecipients(), subject, html, kind: "team-holiday" },
  ])
}

export type HolidayLookaheadRow = {
  barberName: string
  siteName: string
  start: string
  end: string
  days: number
}

/** Friendly UTC date label, e.g. "Sat 5 Sep". */
function fmtHolidayDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

/**
 * Email a "who's off" holiday lookahead to the given recipients as a simple
 * table (who / shop / dates / days). Used for BOTH the monthly last-Saturday
 * digest to Cosmin (the coming month) and the one-off rest-of-year schedule to
 * leadership. De-dupes recipients; a caller passing no rows still sends a
 * clear "nobody's off" note so leadership knows the check ran.
 */
export async function sendHolidayLookaheadEmail(args: {
  recipients: (string | null | undefined)[]
  subject: string
  title: string
  intro: string
  rangeLabel: string
  rows: HolidayLookaheadRow[]
  kind: string
}): Promise<number> {
  const clean = Array.from(
    new Set(args.recipients.map((e) => e?.trim().toLowerCase()).filter(Boolean) as string[]),
  )
  if (clean.length === 0) return 0

  const table = args.rows.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
         <thead>
           <tr style="text-align:left;border-bottom:2px solid #e5e7eb">
             <th style="padding:6px 8px">Who</th>
             <th style="padding:6px 8px">Shop</th>
             <th style="padding:6px 8px">Dates</th>
             <th style="padding:6px 8px;text-align:right">Days</th>
           </tr>
         </thead>
         <tbody>
           ${args.rows
             .map(
               (r) => `<tr style="border-bottom:1px solid #f0f0f0">
                 <td style="padding:6px 8px"><strong>${r.barberName}</strong></td>
                 <td style="padding:6px 8px;color:#555">${r.siteName}</td>
                 <td style="padding:6px 8px">${fmtHolidayDate(r.start)}${
                   r.start === r.end ? "" : ` → ${fmtHolidayDate(r.end)}`
                 }</td>
                 <td style="padding:6px 8px;text-align:right">${r.days}</td>
               </tr>`,
             )
             .join("")}
         </tbody>
       </table>`
    : `<p style="font-size:14px;line-height:1.6;color:#555">No approved holiday booked for ${args.rangeLabel}.</p>`

  const html = wrap(
    args.title,
    `<p style="font-size:14px;line-height:1.6">${args.intro}</p>
     <p style="font-size:13px;color:#666;margin:0 0 4px">${args.rangeLabel} · ${args.rows.length} booking${
       args.rows.length === 1 ? "" : "s"
     }</p>
     ${table}
     <p>${emailButton(`/team`, "Open the Team Area")}</p>`,
  )

  let sent = 0
  for (const to of clean) {
    await sendEmail({ to, subject: args.subject, html, kind: args.kind })
    sent++
  }
  return sent
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
 * Nudge the barber themselves when a NEW 360 cycle opens, asking them to
 * nominate their 5 reviewers. Sent alongside the 1-2-1 invite when a cycle is
 * first created — without this prompt barbers weren't starting their 360 at
 * all, and a never-nominated 360 defaults their PBC to the lowest score.
 * Best-effort: a missing barber email simply means no nudge.
 */
export async function sendThreeSixtyNominationNudge(args: {
  barberId: number
  period: string
  dueOn: string | null
}): Promise<void> {
  const people = await resolveOneToOnePeople(args.barberId)
  if (!people?.barberEmail) return
  const firstName = people.barberName.trim().split(/\s+/)[0] || "there"
  const periodLabel = formatPeriod(args.period)
  const subject = `Nominate your 360 reviewers for ${periodLabel}`
  const html = wrap(
    subject,
    `<p style="font-size:14px;line-height:1.6">Hi ${firstName},</p>
     <p style="font-size:14px;line-height:1.6">
       Your 360 feedback cycle for <strong>${periodLabel}</strong> is now open ahead of your
       1-2-1${args.dueOn ? `, due <strong>${args.dueOn}</strong>` : ""}. Please nominate
       <strong>5 people</strong> to give you feedback — their input is the main driver of your
       PBC rating.</p>
     <p style="font-size:14px;line-height:1.6">
       Nominating takes a minute. If the cycle closes with no reviewers nominated, your rating
       defaults to the lowest score, so please get them in early.</p>
     <p>${emailButton(`/team#three-sixty`, "Nominate my 5 reviewers")}</p>`,
  )
  await sendEmail({ to: people.barberEmail, subject, html, kind: "team-360-nominate-nudge" })
}

/**
 * Chase 360 reviewers who haven't responded on Open cycles. Sends a SINGLE
 * reminder per nominee (only those never reminded — `reminded_at IS NULL`) then
 * stops. We deliberately do NOT re-nag: a reviewer who ignores the one nudge is
 * left alone, and the nominee's own non-response is logged against the barber's
 * accountability record at cycle close (feeding the PBC) instead of a daily
 * chase. This reverts the earlier aggressive daily re-chase.
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
        isNotNull(threeSixtyNominees.invitedAt),
        isNull(threeSixtyNominees.remindedAt),
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

/** Public base URL for links in emails (kept dependency-free on purpose). */
function emailBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "")
  )
}

/**
 * Nudge a barber's MANAGER with a direct link to complete the 1-2-1. The link
 * opens the GDPR-scoped completion page, which shows only that one report's
 * 1-2-1 (no other data) and is reachable only by the assigned manager (or a
 * team admin). Sent alongside the calendar invite so the manager always has an
 * in-app way to record notes and mark it done.
 */
export async function sendOneToOneManagerCompletionLink(args: {
  managerName?: string | null
  managerEmail?: string | null
  barberName: string
  barberId: number
  scheduledFor: Date
}): Promise<void> {
  if (!args.managerEmail) return
  const when = args.scheduledFor.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const url = `${emailBaseUrl()}/one-to-one/${args.barberId}`
  const subject = `Action: complete your 1-2-1 with ${args.barberName}`
  const html = wrap(
    subject,
    `<p style="font-size:14px;line-height:1.6">Hi ${args.managerName ?? "there"},</p>
     <p style="font-size:14px;line-height:1.6">
       Your 1-2-1 with <strong>${args.barberName}</strong> is scheduled for
       <strong>${when}</strong>. Once you've had it, record your notes and mark it
       complete here:</p>
     <p><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Complete this 1-2-1</a></p>
     <p style="font-size:12px;color:#888">This link opens only ${args.barberName}'s 1-2-1
       and is available to you as their manager.</p>`,
  )
  await sendEmail({ to: args.managerEmail, subject, html, kind: "team-1-2-1-complete-link" })
}

/**
 * Email a 1-2-1 calendar invite (.ics) to the barber + their manager, sent AS
 * the barber's manager (their profile email) so it comes from a real person on
 * a verified domain — not a no-reply. If the manager's email isn't on a
 * verified sending domain, sendEmail falls back to the brand default but still
 * sets Reply-To to the manager. This is the PRIMARY notification for both
 * scheduling and moving a 1-2-1 (we no longer rely on Google Calendar's
 * unmonitored no-reply email). On a move, pass `isUpdate` + a higher `sequence`
 * so the recipient's existing calendar entry is updated in place, not duplicated.
 */
export async function sendOneToOneInvite(args: {
  oneToOneId: number
  barberName: string
  barberEmail?: string | null
  managerName?: string | null
  managerEmail?: string | null
  scheduledFor: Date
  replyTo?: string | null
  isUpdate?: boolean
  sequence?: number
}): Promise<void> {
  const attendees = [
    args.barberEmail ? { name: args.barberName, email: args.barberEmail } : null,
    args.managerEmail
      ? { name: args.managerName ?? "Manager", email: args.managerEmail }
      : null,
  ].filter(Boolean) as { name: string; email: string }[]

  // Monotonic-with-time default so each successive invite for the same UID has a
  // higher SEQUENCE than the last — required for a move to supersede the old one.
  const sequence = args.sequence ?? Math.floor((Date.now() - Date.UTC(2024, 0, 1)) / 1000)

  // Send AS the barber's manager (their profile email) so the invite comes from
  // a real person, not a no-reply. sendEmail validates this: if the manager's
  // email isn't on a verified sending domain (e.g. a personal gmail), it falls
  // back to the brand default and we keep replyTo pointed at the manager.
  const managerFrom = args.managerEmail
    ? `${args.managerName ?? "Manager"} <${args.managerEmail}>`
    : undefined
  // The calendar organizer should match the sender identity.
  const organizerEmail = args.managerEmail ?? resolvedFrom().replace(/.*<(.+)>.*/, "$1")
  const organizerName = args.managerName ?? APP_NAME

  const ics = buildIcs({
    uid: `1-2-1-${args.oneToOneId}@lessthanzerobarbers.com`,
    title: `1-2-1: ${args.barberName}`,
    description: `Monthly 1-2-1 between ${args.barberName} and ${
      args.managerName ?? "their manager"
    }.`,
    start: args.scheduledFor,
    durationMinutes: 30,
    organizerName,
    organizerEmail,
    attendees,
    sequence,
  })

  const when = args.scheduledFor.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const subject = args.isUpdate
    ? `1-2-1 moved: ${args.barberName} — now ${when}`
    : `1-2-1 scheduled: ${args.barberName} — ${when}`
  const html = wrap(
    subject,
    args.isUpdate
      ? `<p style="font-size:14px;line-height:1.6">
           Your monthly 1-2-1 has been <strong>moved</strong> to <strong>${when}</strong>.
           Accept the attached calendar invite to update it in your calendar.</p>`
      : `<p style="font-size:14px;line-height:1.6">
           Your monthly 1-2-1 has been scheduled for <strong>${when}</strong>.
           Accept the attached calendar invite to add it to your calendar.</p>`,
  )

  const recipients = attendees.map((a) => a.email)
  for (const to of recipients) {
    await sendEmail({
      to,
      from: managerFrom,
      subject,
      html,
      kind: args.isUpdate ? "team-1-2-1-move" : "team-1-2-1-invite",
      replyTo: args.replyTo ?? args.managerEmail ?? undefined,
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
      // Log the miss once, for the PBC. This is the single overdue escalation
      // (guarded by overdueEscalatedAt) — no repeated nagging beyond this.
      await logAccountabilityMiss({
        kind: "1-2-1",
        ref: `1-2-1:${o.id}`,
        barberId: o.barberId,
        period: o.period ?? null,
        detail: `Monthly 1-2-1${o.dueOn ? ` (due ${o.dueOn})` : ""} went overdue after its reminder.`,
      })
      escalated++
    } catch (e) {
      console.log("[v0] escalateOverdueOneToOnes failed for", o.id, (e as Error).message)
    }
  }
  return escalated
}
