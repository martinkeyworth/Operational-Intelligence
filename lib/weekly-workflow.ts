import "server-only"
import { and, eq, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  weeklyReports,
  actions,
  user as userTable,
  weeklyTakings,
  sites,
} from "@/lib/db/schema"
import { fmtWeekLong, getActions } from "@/lib/data"
import { canonicalAreaKey } from "@/lib/function-areas"
import { fmtGBP } from "@/lib/format"
import { sendEmail, emailShell, ragChip } from "@/lib/email"
import {
  getSubmissionStatus,
  getSiteManagerContacts,
  type SubmissionItem,
} from "@/lib/submissions"
import { sweepAutoEscalations } from "@/lib/registers"
import { OWNER_EMAILS } from "@/lib/access-types"
import { defaultOwnerEmailForArea } from "@/lib/area-owners"
import {
  currentWeekEnding,
  getOrCreateReport,
  getCompanyRecipients,
  getAllRecipients,
  buildComparison,
  runWeeklyAnalysis,
  reviewNarrative,
  appBaseUrl,
} from "@/lib/reporting"

/**
 * Saturday workflow steps. Each is idempotent and keyed off weekly_reports so
 * the cron can call them at the right times (UK):
 *  - 17:00 remindUsers          → nudge everyone to update their section
 *  - 18:00 submissionAlert       → email leadership who is still outstanding
 *  - 18:00 confirmationPrompt    → urgent "confirm & submit" to each manager/lead
 *  - 19:00 escalateUnconfirmed   → escalate anything still outstanding to owners
 *  - 18:50 runAnalysis          → AI week-on-week KPI analysis
 *  - 19:00 requestCosminNarrative → email COO for a narrative
 *  - 20:00 sendBoardReport      → RAG + AI review to all @company users
 *  - 20:30 requestMartinResponse → email CEO for his response
 */

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
}
function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ESC[c])
}
/** Render plain AI/narrative text into simple HTML paragraphs. */
function toHtml(text: string): string {
  return esc(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("")
}

// 17:00 — remind all registered users to update their section.
export async function remindUsers(weekEnding = currentWeekEnding()) {
  const report = await getOrCreateReport(weekEnding)
  if (report.remindersSentAt) return { skipped: true, reason: "already sent" }

  // Every registered user (barbers and external collaborators included),
  // not just @COMPANY_DOMAIN accounts — everyone needs to submit their update.
  const recipients = await getAllRecipients()
  const url = appBaseUrl()
  const body = (name: string) =>
    emailShell(
      `Weekly update reminder · w/e ${fmtWeekLong(weekEnding)}`,
      `<p style="margin:0 0 12px;">Hi ${esc(name || "there")},</p>
       <p style="margin:0 0 12px;">This is your Saturday reminder to update your area for the week ending <strong>${fmtWeekLong(
         weekEnding,
       )}</strong>. Please enter your takings, KPIs and any actions before this evening's board report.</p>
       <p style="margin:16px 0;"><a href="${url}/data-entry" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Update my section</a></p>
       <p style="margin:0;color:#6b7280;">Thank you.</p>`,
    )

  let sent = 0
  for (const r of recipients) {
    const res = await sendEmail({
      to: r.email,
      subject: `Reminder: update your section (w/e ${fmtWeekLong(weekEnding)})`,
      html: body(r.name),
      kind: "reminder",
      weekEnding,
    })
    if (res.ok) sent++
  }

  await db
    .update(weeklyReports)
    .set({ remindersSentAt: new Date() })
    .where(eq(weeklyReports.weekEnding, weekEnding))
  return { sent, total: recipients.length }
}

// 18:00 — chase outstanding submissions. Each department head receives a chase
// listing ONLY their outstanding items; the owners (Martin + Cosmin) receive
// the full overview of everything still outstanding.
export async function submissionAlert(weekEnding = currentWeekEnding()) {
  const report = await getOrCreateReport(weekEnding)
  if (report.submissionAlertSentAt) return { skipped: true, reason: "already sent" }

  const status = await getSubmissionStatus(weekEnding)
  const url = appBaseUrl()

  // Resolve recipients against registered company users so we use their real
  // names/casing and only email people who actually exist.
  const companyUsers = await getCompanyRecipients()
  const findUser = (email: string) =>
    companyUsers.find((u) => u.email.toLowerCase() === email.toLowerCase())

  const owners = companyUsers.filter((r) =>
    OWNER_EMAILS.includes(r.email.toLowerCase()),
  )

  // Map an outstanding item to the department head responsible for chasing it.
  const headFor = (item: (typeof status.outstanding)[number]): string | null => {
    switch (item.category) {
      case "Takings":
      case "Confirmation":
        return "mario@lessthanzerobarbers.com" // Head of Brands
      case "Training":
        return "ravi@lessthanzerobarbers.com" // Training Director
      case "KPI":
        return item.label.toLowerCase().startsWith("hr")
          ? "luke@lessthanzerobarbers.com" // HR Director
          : "mario@lessthanzerobarbers.com" // Marketing → Head of Brands
      case "Subletting":
      default:
        return null // owners only
    }
  }

  const summaryRag = status.complete ? "green" : status.pct >= 75 ? "amber" : "red"

  // Build the HTML body for a given recipient + their relevant items.
  const buildHtml = (
    items: typeof status.outstanding,
    forOwner: boolean,
  ) => {
    const intro = status.complete
      ? `<p style="margin:0 0 12px;color:#16a34a;font-weight:600;">All weekly submissions are in for w/e ${fmtWeekLong(
          weekEnding,
        )}. Nothing outstanding ahead of tonight's board report.</p>`
      : items.length === 0
        ? `<p style="margin:0 0 12px;color:#16a34a;font-weight:600;">Nothing outstanding in your area for w/e ${fmtWeekLong(
            weekEnding,
          )}. Thank you.</p>`
        : `<p style="margin:0 0 12px;">The following <strong>${items.length}</strong> ${
            items.length === 1 ? "item is" : "items are"
          } still outstanding ahead of tonight's 20:00 board report${
            forOwner ? "" : " in your area"
          }:</p>
       <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 16px;">
         <thead><tr style="color:#6b7280;text-align:left;font-size:11px;text-transform:uppercase;">
           <th style="padding:0 0 6px;">Outstanding</th>
           <th style="padding:0 0 6px;">Owner</th>
           <th style="padding:0 0 6px;text-align:right;">Status</th>
         </tr></thead>
         <tbody>${items
           .map(
             (i) =>
               `<tr>
                 <td style="padding:7px 8px 7px 0;border-bottom:1px solid #f0f0f0;">${esc(
                   i.label,
                 )}</td>
                 <td style="padding:7px 8px 7px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;">${esc(
                   i.ownerRole,
                 )}</td>
                 <td style="padding:7px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#6b7280;">${esc(
                   i.detail,
                 )}</td>
               </tr>`,
           )
           .join("")}</tbody>
       </table>`

    return emailShell(
      `Submission status · w/e ${fmtWeekLong(weekEnding)}`,
      `${
        forOwner
          ? `<p style="margin:0 0 8px;">Submission readiness: ${ragChip(summaryRag)} <strong>${
              status.submittedCount
            }/${status.total}</strong> in (${status.pct}%).</p>`
          : ""
      }
     ${intro}
     <p style="margin:16px 0;"><a href="${url}/reports/submissions" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">View submission board</a></p>
     <p style="margin:0;color:#6b7280;">Sent at 18:00 so there's time to chase before the board report.</p>`,
    )
  }

  let sent = 0
  const sendToUser = async (
    userEntry: { email: string },
    items: typeof status.outstanding,
    forOwner: boolean,
  ) => {
    const res = await sendEmail({
      to: userEntry.email,
      subject: status.complete
        ? `Submissions complete (w/e ${fmtWeekLong(weekEnding)})`
        : forOwner
          ? `${status.outstandingCount} submissions outstanding (w/e ${fmtWeekLong(
              weekEnding,
            )})`
          : `${items.length} outstanding in your area (w/e ${fmtWeekLong(
              weekEnding,
            )})`,
      html: buildHtml(items, forOwner),
      kind: "submission_alert",
      weekEnding,
    })
    if (res.ok) sent++
  }

  // 1) Owners always get the full overview.
  for (const owner of owners) {
    await sendToUser(owner, status.outstanding, true)
  }

  // 2) Department heads get a chase of only their outstanding items.
  //    Skip anyone who is also an owner (already covered) and skip when there's
  //    nothing outstanding overall.
  if (!status.complete) {
    const byHead = new Map<string, typeof status.outstanding>()
    for (const item of status.outstanding) {
      const head = headFor(item)
      if (!head) continue
      if (OWNER_EMAILS.includes(head.toLowerCase())) continue
      const list = byHead.get(head) ?? []
      list.push(item)
      byHead.set(head, list)
    }
    for (const [head, items] of byHead) {
      const userEntry = findUser(head)
      if (!userEntry) continue // not a registered user → skip
      await sendToUser(userEntry, items, false)
    }
  }

  await db
    .update(weeklyReports)
    .set({ submissionAlertSentAt: new Date() })
    .where(eq(weeklyReports.weekEnding, weekEnding))
  return { sent, outstanding: status.outstandingCount }
}

// ---------------------------------------------------------------------------
// Urgent confirmation prompt (18:00) + owner escalation (19:00).
//
// The 18:00 submissionAlert tells leadership WHO is outstanding. These two
// steps chase the person who actually has to act:
//   1) confirmationPrompt  (18:00) — email the responsible SITE MANAGER (or
//      area lead) an urgent "you must confirm/submit these items tonight".
//   2) escalateUnconfirmed (19:00) — an hour later, anything STILL outstanding
//      is escalated to the OWNERS (Martin + Cosmin) with instructions to
//      resolve, plus a copy to the manager so they know it went up.
// Both are idempotent (guarded by weekly_reports.confirm* timestamps).
// ---------------------------------------------------------------------------

// Resolve the email(s) responsible for actioning a single outstanding item.
function responsibleEmailsFor(
  item: SubmissionItem,
  contacts: Map<number, { emails: string[] }>,
): string[] {
  // Site-scoped work (takings, confirmation, subletting, training) → the site
  // manager who owns that site.
  if (item.siteId != null) {
    const emails = contacts.get(item.siteId)?.emails ?? []
    if (emails.length > 0) return emails
    // No resolvable site manager → fall back to the accountable area lead.
    if (item.category === "Training")
      return [defaultOwnerEmailForArea("Training")]
    if (item.category === "Subletting")
      return [defaultOwnerEmailForArea("Subletting")]
    return [defaultOwnerEmailForArea("Marketing")] // Takings/Confirmation → Head of Brands
  }
  // Group-level KPI areas.
  if (item.category === "KPI") {
    return item.label.toLowerCase().startsWith("hr")
      ? [defaultOwnerEmailForArea("HR")]
      : [defaultOwnerEmailForArea("Marketing")]
  }
  return []
}

// Build the exact in-app URL that resolves a single outstanding item, so the
// recipient lands directly on the page (and week) they need to action rather
// than a generic entry screen.
function deepLinkFor(item: SubmissionItem, weekEnding: string): string {
  const base = appBaseUrl().replace(/\/+$/, "") // strip trailing slash
  const w = `week=${encodeURIComponent(weekEnding)}`
  switch (item.category) {
    case "Takings":
      // Per-barber takings entry, jumped to this site's section.
      return `${base}/data-entry?${w}${item.siteId != null ? `#site-${item.siteId}` : ""}`
    case "Confirmation":
    case "Subletting":
      // Weekly confirmation dialog + subletting card both live on the site page.
      return item.siteId != null
        ? `${base}/sites/${item.siteId}?${w}`
        : `${base}/data-entry?${w}`
    case "Training":
      return `${base}/functions/Training/input?${w}`
    case "KPI":
      return item.label.toLowerCase().startsWith("hr")
        ? `${base}/functions/HR/input?${w}`
        : `${base}/functions/Marketing/input?${w}`
    default:
      return `${base}/data-entry?${w}`
  }
}

// Render an outstanding-items table for a chase/escalation email. Every row's
// label is a direct link to the exact page/week that resolves that item.
function outstandingTable(items: SubmissionItem[], weekEnding: string): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 16px;">
     <thead><tr style="color:#6b7280;text-align:left;font-size:11px;text-transform:uppercase;">
       <th style="padding:0 0 6px;">Outstanding — tap to open</th>
       <th style="padding:0 0 6px;text-align:right;">Status</th>
     </tr></thead>
     <tbody>${items
       .map(
         (i) =>
           `<tr>
             <td style="padding:7px 8px 7px 0;border-bottom:1px solid #f0f0f0;">
               <a href="${deepLinkFor(i, weekEnding)}" style="color:#b91c1c;text-decoration:underline;font-weight:600;">${esc(
                 i.label,
               )}</a>
               <span style="color:#9ca3af;"> &rarr;</span>
             </td>
             <td style="padding:7px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#b91c1c;">${esc(
               i.detail,
             )}</td>
           </tr>`,
       )
       .join("")}</tbody>
   </table>`
}

// No-send preview: shows exactly who the 18:00 prompt would email, which items
// each person is responsible for, and the precise deep-link per item — plus who
// the 19:00 escalation would go to. Sends NO email and writes NO timestamps.
export async function dryRunConfirmationPlan(weekEnding = currentWeekEnding()) {
  const status = await getSubmissionStatus(weekEnding)
  const contacts = await getSiteManagerContacts()

  const byPerson = new Map<string, SubmissionItem[]>()
  for (const item of status.outstanding) {
    for (const email of responsibleEmailsFor(item, contacts)) {
      const list = byPerson.get(email) ?? []
      list.push(item)
      byPerson.set(email, list)
    }
  }

  const prompt1800 = [...byPerson.entries()].map(([email, items]) => ({
    email,
    items: items.map((i) => ({
      label: i.label,
      status: i.detail,
      link: deepLinkFor(i, weekEnding),
    })),
  }))

  const responsible = new Set<string>()
  for (const item of status.outstanding)
    for (const email of responsibleEmailsFor(item, contacts))
      responsible.add(email)

  return {
    weekEnding,
    complete: status.complete,
    outstandingCount: status.outstandingCount,
    prompt1800, // who gets the urgent "confirm now" email + their deep-links
    escalation1900: {
      owners: OWNER_EMAILS, // escalated to owners after 1hr if still outstanding
      managersChased: [...responsible].filter(
        (e) => !OWNER_EMAILS.includes(e.toLowerCase()),
      ),
    },
    siteManagers: [...contacts.values()].map((c) => ({
      site: c.siteName,
      managerName: c.managerName,
      emails: c.emails,
    })),
  }
}

// Send the urgent "confirm now" prompt to ONE specific person for just their
// outstanding items. Used to chase an individual (e.g. a late confirmation)
// without re-emailing everyone or touching the idempotency timestamp.
export async function sendConfirmPromptTo(
  email: string,
  weekEnding = currentWeekEnding(),
) {
  const target = email.trim().toLowerCase()
  const status = await getSubmissionStatus(weekEnding)
  const contacts = await getSiteManagerContacts()

  const items = status.outstanding.filter((item) =>
    responsibleEmailsFor(item, contacts).some(
      (e) => e.toLowerCase() === target,
    ),
  )
  if (items.length === 0)
    return { sent: 0, email: target, reason: "nothing outstanding for this person" }

  const html = emailShell(
    `Action needed tonight · w/e ${fmtWeekLong(weekEnding)}`,
    `<p style="margin:0 0 12px;color:#b91c1c;font-weight:600;">Please confirm and submit the following before tonight's 20:00 board report.</p>
     <p style="margin:0 0 12px;">These items for week ending <strong>${fmtWeekLong(
       weekEnding,
     )}</strong> are still outstanding. <strong>Tap each item below</strong> to go straight to the exact page you need to update (enter the figures, then tick the weekly confirmation):</p>
     ${outstandingTable(items, weekEnding)}
     <p style="margin:0;color:#6b7280;">If this isn't resolved within the hour it will be escalated to Martin and Cosmin.</p>`,
  )
  const res = await sendEmail({
    to: target,
    subject: `Urgent: confirm ${items.length} item${
      items.length === 1 ? "" : "s"
    } tonight (w/e ${fmtWeekLong(weekEnding)})`,
    html,
    kind: "confirm_prompt",
    weekEnding,
  })
  return { sent: res.ok ? 1 : 0, email: target, items: items.map((i) => i.label) }
}

// 18:00 — urgent prompt to each responsible manager/lead to confirm & submit
// their outstanding items before tonight's board report.
export async function confirmationPrompt(weekEnding = currentWeekEnding()) {
  const report = await getOrCreateReport(weekEnding)
  if (report.confirmPromptSentAt) return { skipped: true, reason: "already sent" }

  const status = await getSubmissionStatus(weekEnding)
  if (status.complete) {
    await db
      .update(weeklyReports)
      .set({ confirmPromptSentAt: new Date() })
      .where(eq(weeklyReports.weekEnding, weekEnding))
    return { sent: 0, reason: "nothing outstanding" }
  }

  const contacts = await getSiteManagerContacts()

  // Group outstanding items by the person who must action them.
  const byPerson = new Map<string, SubmissionItem[]>()
  for (const item of status.outstanding) {
    for (const email of responsibleEmailsFor(item, contacts)) {
      const list = byPerson.get(email) ?? []
      list.push(item)
      byPerson.set(email, list)
    }
  }

  let sent = 0
  for (const [email, items] of byPerson) {
    const html = emailShell(
      `Action needed tonight · w/e ${fmtWeekLong(weekEnding)}`,
      `<p style="margin:0 0 12px;color:#b91c1c;font-weight:600;">Please confirm and submit the following before tonight's 20:00 board report.</p>
       <p style="margin:0 0 12px;">These items for week ending <strong>${fmtWeekLong(
         weekEnding,
       )}</strong> are still outstanding. <strong>Tap each item below</strong> to go straight to the exact page you need to update (enter the figures, and tick the weekly confirmation once your barbers' takings are in):</p>
       ${outstandingTable(items, weekEnding)}
       <p style="margin:0;color:#6b7280;">If this isn't resolved within the hour it will be escalated to Martin and Cosmin at 19:00.</p>`,
    )
    const res = await sendEmail({
      to: email,
      subject: `Urgent: confirm ${items.length} item${
        items.length === 1 ? "" : "s"
      } tonight (w/e ${fmtWeekLong(weekEnding)})`,
      html,
      kind: "confirm_prompt",
      weekEnding,
    })
    if (res.ok) sent++
  }

  await db
    .update(weeklyReports)
    .set({ confirmPromptSentAt: new Date() })
    .where(eq(weeklyReports.weekEnding, weekEnding))
  return { sent, people: byPerson.size, outstanding: status.outstandingCount }
}

// 19:00 — one hour after the urgent prompt, escalate anything STILL outstanding
// to the owners with instructions to resolve, cc'ing the responsible manager.
export async function escalateUnconfirmed(weekEnding = currentWeekEnding()) {
  const report = await getOrCreateReport(weekEnding)
  if (report.confirmEscalatedAt) return { skipped: true, reason: "already sent" }

  const status = await getSubmissionStatus(weekEnding)
  if (status.complete) {
    await db
      .update(weeklyReports)
      .set({ confirmEscalatedAt: new Date() })
      .where(eq(weeklyReports.weekEnding, weekEnding))
    return { escalated: 0, reason: "all resolved" }
  }

  const contacts = await getSiteManagerContacts()
  const companyUsers = await getCompanyRecipients()
  const owners = companyUsers.filter((r) =>
    OWNER_EMAILS.includes(r.email.toLowerCase()),
  )
  const url = appBaseUrl()

  // Which managers are responsible for the still-outstanding items (for cc +
  // the "chase these people" instruction in the owner email).
  const responsible = new Set<string>()
  for (const item of status.outstanding) {
    for (const email of responsibleEmailsFor(item, contacts)) {
      responsible.add(email)
    }
  }

  const html = emailShell(
    `Escalation: unconfirmed submissions · w/e ${fmtWeekLong(weekEnding)}`,
    `<p style="margin:0 0 12px;color:#b91c1c;font-weight:600;">${
      status.outstandingCount
    } item${
      status.outstandingCount === 1 ? " is" : "s are"
    } still outstanding an hour after the 18:00 urgent prompt.</p>
     <p style="margin:0 0 12px;">The responsible managers were asked to confirm at 18:00 and have not done so. Please chase them directly to resolve before the board report. Each item links to the exact page that resolves it:</p>
     ${outstandingTable(status.outstanding, weekEnding)}
     <p style="margin:0 0 12px;color:#6b7280;">Responsible to chase: ${
       [...responsible].map((e) => esc(e)).join(", ") || "n/a"
     }.</p>
     <p style="margin:16px 0;"><a href="${url}/reports/submissions" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Open submission board</a></p>`,
  )

  let notified = 0
  for (const owner of owners) {
    const res = await sendEmail({
      to: owner.email,
      subject: `Escalation: ${status.outstandingCount} unconfirmed (w/e ${fmtWeekLong(
        weekEnding,
      )})`,
      html,
      kind: "confirm_escalation",
      weekEnding,
    })
    if (res.ok) notified++
  }

  // Also nudge each responsible manager that it has now gone up to the owners.
  let managersNudged = 0
  for (const email of responsible) {
    if (OWNER_EMAILS.includes(email.toLowerCase())) continue // owner already emailed
    const theirItems = status.outstanding.filter((i) =>
      responsibleEmailsFor(i, contacts).includes(email),
    )
    if (theirItems.length === 0) continue
    const mgrHtml = emailShell(
      `Escalated to leadership · w/e ${fmtWeekLong(weekEnding)}`,
      `<p style="margin:0 0 12px;color:#b91c1c;font-weight:600;">Your outstanding item${
        theirItems.length === 1 ? "" : "s"
      } for w/e ${fmtWeekLong(weekEnding)} ${
        theirItems.length === 1 ? "has" : "have"
      } been escalated to Martin and Cosmin.</p>
       <p style="margin:0 0 12px;"><strong>Tap each item below</strong> to open the exact page and resolve it immediately:</p>
       ${outstandingTable(theirItems, weekEnding)}`,
    )
    const res = await sendEmail({
      to: email,
      subject: `Escalated: resolve ${theirItems.length} outstanding item${
        theirItems.length === 1 ? "" : "s"
      } now (w/e ${fmtWeekLong(weekEnding)})`,
      html: mgrHtml,
      kind: "confirm_escalation",
      weekEnding,
    })
    if (res.ok) managersNudged++
  }

  await db
    .update(weeklyReports)
    .set({ confirmEscalatedAt: new Date() })
    .where(eq(weeklyReports.weekEnding, weekEnding))
  return {
    escalated: status.outstandingCount,
    ownersNotified: notified,
    managersNudged,
  }
}

// 18:50 — run the AI week-on-week analysis across all KPI areas.
export async function runAnalysis(weekEnding = currentWeekEnding()) {
  const { analysis, scorecard } = await runWeeklyAnalysis(weekEnding)
  return {
    overallRag: scorecard.overallRag,
    overallPct: scorecard.overallPct,
    analysisChars: analysis.length,
  }
}

// 19:00 — ask Cosmin (COO) for a narrative to add to the AI analysis.
export async function requestCosminNarrative(weekEnding = currentWeekEnding()) {
  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekEnding, weekEnding))
  if (!report) return { skipped: true, reason: "no report" }

  const recipients = await getCompanyRecipients()
  const cosmin = recipients.find((r) => r.email.toLowerCase().startsWith("cosmin@"))
  if (!cosmin) return { skipped: true, reason: "cosmin not found" }

  const url = appBaseUrl()
  const html = emailShell(
    `Your narrative needed · w/e ${fmtWeekLong(weekEnding)}`,
    `<p style="margin:0 0 12px;">Hi ${esc(cosmin.name || "Cosmin")},</p>
     <p style="margin:0 0 12px;">The AI week-on-week analysis is ready (overall ${ragChip(
       report.overallRag ?? "amber",
     )} ${report.overallPct ?? ""}%). Please add your COO narrative so it can be combined and sent to Martin.</p>
     <div style="background:#f4f4f5;border-radius:8px;padding:12px;margin:0 0 16px;">${toHtml(
       report.aiAnalysis ?? "Analysis pending.",
     )}</div>
     <p style="margin:16px 0;"><a href="${url}/reports/${weekEnding}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Add my narrative</a></p>`,
  )

  const res = await sendEmail({
    to: cosmin.email,
    subject: `Action: add your narrative (w/e ${fmtWeekLong(weekEnding)})`,
    html,
    kind: "narrative_request",
    weekEnding,
  })
  return { sent: res.ok, to: cosmin.email }
}

// 20:00 — email the dashboard RAG + AI review to all @company users.
export async function sendBoardReport(weekEnding = currentWeekEnding()) {
  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekEnding, weekEnding))
  if (!report) return { skipped: true, reason: "no report" }

  const { rows } = await buildComparison(weekEnding)
  const review = await reviewNarrative(weekEnding)

  const rowsHtml = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">${esc(r.area)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${ragChip(
            r.currRag,
          )}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${r.currPct}%</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#6b7280;">${
            r.prevPct === null ? "—" : `${r.prevPct}%`
          }</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;text-transform:capitalize;color:${
            r.trend === "improving"
              ? "#16a34a"
              : r.trend === "declining"
                ? "#dc2626"
                : "#6b7280"
          };">${r.trend}</td>
        </tr>`,
    )
    .join("")

  const missingNote =
    !report.cosminNarrative || !report.martinResponse
      ? `<p style="margin:0 0 12px;color:#d97706;">Note: ${
          !report.cosminNarrative ? "COO narrative" : ""
        }${!report.cosminNarrative && !report.martinResponse ? " and " : ""}${
          !report.martinResponse ? "CEO response" : ""
        } not yet submitted; this review reflects the data available so far.</p>`
      : ""

  const html = emailShell(
    `Weekly board report · w/e ${fmtWeekLong(weekEnding)}`,
    `<p style="margin:0 0 8px;">Overall business RAG: ${ragChip(
      report.overallRag ?? "amber",
    )} <strong>${report.overallPct ?? ""}%</strong></p>
     ${missingNote}
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0 20px;">
       <thead><tr style="color:#6b7280;text-align:left;font-size:11px;text-transform:uppercase;">
         <th style="padding:0 0 6px;">Area</th>
         <th style="padding:0 0 6px;text-align:center;">RAG</th>
         <th style="padding:0 0 6px;text-align:right;">This wk</th>
         <th style="padding:0 0 6px;text-align:right;">Last wk</th>
         <th style="padding:0 0 6px;text-align:right;">Trend</th>
       </tr></thead>
       <tbody>${rowsHtml}</tbody>
     </table>
     <h3 style="margin:0 0 8px;font-size:14px;">AI review</h3>
     ${toHtml(review)}
     ${
       report.cosminNarrative
         ? `<h3 style="margin:20px 0 8px;font-size:14px;">COO narrative</h3>${toHtml(report.cosminNarrative)}`
         : ""
     }
     ${
       report.martinResponse
         ? `<h3 style="margin:20px 0 8px;font-size:14px;">CEO response</h3>${toHtml(report.martinResponse)}`
         : ""
     }
     <p style="margin:16px 0 0;"><a href="${appBaseUrl()}/reports/${weekEnding}" style="color:#111827;font-weight:600;">View full report →</a></p>`,
  )

  const recipients = await getCompanyRecipients()
  let sent = 0
  for (const r of recipients) {
    const res = await sendEmail({
      to: r.email,
      subject: `LTZ weekly board report — ${report.overallRag?.toUpperCase() ?? ""} ${
        report.overallPct ?? ""
      }% (w/e ${fmtWeekLong(weekEnding)})`,
      html,
      kind: "board_report",
      weekEnding,
    })
    if (res.ok) sent++
  }

  await db
    .update(weeklyReports)
    .set({ reportSentAt: new Date() })
    .where(eq(weeklyReports.weekEnding, weekEnding))
  return { sent, total: recipients.length }
}

// 20:30 — ask Martin (CEO) for his response to the narrative.
export async function requestMartinResponse(weekEnding = currentWeekEnding()) {
  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekEnding, weekEnding))
  if (!report) return { skipped: true, reason: "no report" }

  const recipients = await getCompanyRecipients()
  const martin = recipients.find((r) => r.email.toLowerCase().startsWith("martin@"))
  if (!martin) return { skipped: true, reason: "martin not found" }

  const url = appBaseUrl()
  const html = emailShell(
    `Your response needed · w/e ${fmtWeekLong(weekEnding)}`,
    `<p style="margin:0 0 12px;">Hi ${esc(martin.name || "Martin")},</p>
     <p style="margin:0 0 12px;">Please add your CEO response to this week's analysis and Cosmin's narrative.</p>
     <div style="background:#f4f4f5;border-radius:8px;padding:12px;margin:0 0 12px;">
       <strong style="font-size:12px;color:#6b7280;text-transform:uppercase;">AI analysis</strong>
       ${toHtml(report.aiAnalysis ?? "Pending.")}
       <strong style="font-size:12px;color:#6b7280;text-transform:uppercase;">COO narrative</strong>
       ${toHtml(report.cosminNarrative ?? "Not yet submitted.")}
     </div>
     <p style="margin:16px 0;"><a href="${url}/reports/${weekEnding}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Add my response</a></p>`,
  )

  const res = await sendEmail({
    to: martin.email,
    subject: `Action: add your response (w/e ${fmtWeekLong(weekEnding)})`,
    html,
    kind: "narrative_request",
    weekEnding,
  })
  return { sent: res.ok, to: martin.email }
}

// Weekly — email Martin & Cosmin the cash vs card Ready-To-Bank (RTB / house
// rent share) for the week, broken down by brand. RTB cash = sum of cash_rent,
// RTB card = sum of card_rent across all takings for the week, grouped by the
// site's brand.
export async function sendBrandRtbSummary(weekEnding = currentWeekEnding()) {
  const rows = await db
    .select({
      brand: sites.brand,
      cashRtb: sql<number>`coalesce(sum(${weeklyTakings.cashRent}), 0)`,
      cardRtb: sql<number>`coalesce(sum(${weeklyTakings.cardRent}), 0)`,
    })
    .from(weeklyTakings)
    .innerJoin(sites, eq(weeklyTakings.siteId, sites.id))
    .where(eq(weeklyTakings.weekEnding, weekEnding))
    .groupBy(sites.brand)
    .orderBy(sites.brand)

  const brands = rows.map((r) => ({
    brand: r.brand,
    cash: Number(r.cashRtb ?? 0),
    card: Number(r.cardRtb ?? 0),
  }))
  const totalCash = brands.reduce((a, b) => a + b.cash, 0)
  const totalCard = brands.reduce((a, b) => a + b.card, 0)
  const grand = totalCash + totalCard

  const rowsHtml =
    brands.length === 0
      ? `<tr><td colspan="4" style="padding:12px 0;color:#6b7280;">No takings recorded for this week yet.</td></tr>`
      : brands
          .map(
            (b) =>
              `<tr>
                <td style="padding:8px 8px 8px 0;border-bottom:1px solid #f0f0f0;">${esc(
                  b.brand,
                )}</td>
                <td style="padding:8px 8px 8px 0;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtGBP(
                  b.cash,
                )}</td>
                <td style="padding:8px 8px 8px 0;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtGBP(
                  b.card,
                )}</td>
                <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmtGBP(
                  b.cash + b.card,
                )}</td>
              </tr>`,
          )
          .join("")

  const url = appBaseUrl()
  const html = emailShell(
    `Cash & card RTB by brand · w/e ${fmtWeekLong(weekEnding)}`,
    `<p style="margin:0 0 12px;">Ready-To-Bank (house rent share) for the week ending <strong>${fmtWeekLong(
      weekEnding,
    )}</strong>, split by payment method and broken down by brand.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 16px;">
       <thead><tr style="color:#6b7280;text-align:left;font-size:11px;text-transform:uppercase;">
         <th style="padding:0 0 6px;">Brand</th>
         <th style="padding:0 0 6px;text-align:right;">Cash RTB</th>
         <th style="padding:0 0 6px;text-align:right;">Card RTB</th>
         <th style="padding:0 0 6px;text-align:right;">Total</th>
       </tr></thead>
       <tbody>${rowsHtml}</tbody>
       <tfoot><tr style="font-weight:700;">
         <td style="padding:10px 8px 0 0;">All brands</td>
         <td style="padding:10px 8px 0 0;text-align:right;">${fmtGBP(totalCash)}</td>
         <td style="padding:10px 8px 0 0;text-align:right;">${fmtGBP(totalCard)}</td>
         <td style="padding:10px 0 0;text-align:right;">${fmtGBP(grand)}</td>
       </tr></tfoot>
     </table>
     <p style="margin:16px 0;"><a href="${url}/reports" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">View full report</a></p>
     <p style="margin:0;color:#6b7280;">Automated weekly summary.</p>`,
  )

  let sent = 0
  for (const email of OWNER_EMAILS) {
    const res = await sendEmail({
      to: email,
      subject: `Cash & card RTB by brand (w/e ${fmtWeekLong(weekEnding)})`,
      html,
      kind: "brand_rtb_summary",
      weekEnding,
    })
    if (res.ok) sent++
  }
  return { brands: brands.length, totalCash, totalCard, sent }
}

// Daily 07:00 — email each owner the open RED actions assigned to them, so the
// person responsible gets a direct daily nudge (not just a leadership digest).
// RED is the *effective* RAG from getActions() — i.e. the auto-calculated colour
// (age + priority + KPI + the 5x5/Strategy "red until done" rule) or a manual
// pin. Actions are matched to a user by ownerUserId where set, otherwise by the
// owner name matching a registered user's name. Actions with no resolvable
// email are skipped (and reported) so nothing fails silently.
export async function remindRedActionOwners() {
  const all = await getActions()
  const redOpen = all.filter((a) => a.rag === "red" && a.status !== "Closed")

  if (redOpen.length === 0) {
    return { owners: 0, emailsSent: 0, actions: 0, unassigned: 0 }
  }

  const users = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email })
    .from(userTable)
  const byId = new Map(users.map((u) => [u.id, u]))
  const byName = new Map(
    users.map((u) => [u.name.trim().toLowerCase(), u]),
  )

  // Group red actions by the resolved recipient email.
  type Recipient = { email: string; name: string; items: typeof redOpen }
  const groups = new Map<string, Recipient>()
  let unassigned = 0

  for (const a of redOpen) {
    const u =
      (a.ownerUserId ? byId.get(a.ownerUserId) : undefined) ??
      byName.get(a.owner.trim().toLowerCase())
    if (!u) {
      unassigned++
      continue
    }
    const key = u.email.toLowerCase()
    if (!groups.has(key)) {
      groups.set(key, { email: u.email, name: u.name, items: [] })
    }
    groups.get(key)!.items.push(a)
  }

  const url = appBaseUrl()
  let emailsSent = 0
  let actionsCovered = 0

  for (const r of groups.values()) {
    actionsCovered += r.items.length
    const rowsHtml = r.items
      .map((a) => {
        const reason = a.overdue
          ? `${a.daysOverdue} day${a.daysOverdue === 1 ? "" : "s"} overdue`
          : canonicalAreaKey(a.functionArea) === "Strategy"
            ? "5x5 plan — red until done"
            : `${a.priority} priority`
        return `<tr>
            <td style="padding:8px 8px 8px 0;border-bottom:1px solid #f0f0f0;">${esc(
              a.title,
            )}</td>
            <td style="padding:8px 8px 8px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;">${esc(
              a.functionArea,
            )}</td>
            <td style="padding:8px 8px 8px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;">${esc(
              reason,
            )}</td>
            <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:${
              a.dueDate ? "#dc2626" : "#6b7280"
            };">${a.dueDate ? `Due ${String(a.dueDate)}` : "No due date"}</td>
          </tr>`
      })
      .join("")

    const html = emailShell(
      "Your red actions need attention",
      `<p style="margin:0 0 12px;">Hi ${esc(r.name || "there")},</p>
       <p style="margin:0 0 12px;">You have ${ragChip("red")} <strong>${
         r.items.length
       }</strong> ${
         r.items.length === 1 ? "action" : "actions"
       } currently rated red and not yet closed. Please review and update ${
         r.items.length === 1 ? "it" : "them"
       } today.</p>
       <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 16px;">
         <thead><tr style="color:#6b7280;text-align:left;font-size:11px;text-transform:uppercase;">
           <th style="padding:0 0 6px;">Action</th>
           <th style="padding:0 0 6px;">Area</th>
           <th style="padding:0 0 6px;">Why red</th>
           <th style="padding:0 0 6px;text-align:right;">Due</th>
         </tr></thead>
         <tbody>${rowsHtml}</tbody>
       </table>
       <p style="margin:16px 0;"><a href="${url}/governance?tab=actions" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Review my actions</a></p>
       <p style="margin:0;color:#6b7280;">This is an automated daily reminder sent at 07:00.</p>`,
    )

    const res = await sendEmail({
      to: r.email,
      subject: `${r.items.length} red action${
        r.items.length === 1 ? "" : "s"
      } need your attention`,
      html,
      kind: "red_action_reminder",
      weekEnding: null,
    })
    if (res.ok) emailsSent++
  }

  return {
    owners: groups.size,
    emailsSent,
    actions: actionsCovered,
    unassigned,
  }
}

// Daily — run the auto-escalation sweep so overdue / persistently-red actions
// escalate on time without anyone having to open the Actions page. When new
// items escalate, email the owners (Martin + Cosmin) a digest so the "AI timed
// actions" are visible, not silent.
export async function runDailyEscalation() {
  const escalated = await sweepAutoEscalations()
  if (escalated === 0) return { escalated: 0, notified: 0 }

  const recipients = await getCompanyRecipients()
  const owners = recipients.filter((r) =>
    OWNER_EMAILS.includes(r.email.toLowerCase()),
  )
  const url = appBaseUrl()
  const html = emailShell(
    "Actions auto-escalated",
    `<p style="margin:0 0 12px;"><strong>${escalated}</strong> open ${
      escalated === 1 ? "action has" : "actions have"
    } been automatically escalated because they are overdue by 7+ days or have been red for 2+ weeks without resolution.</p>
     <p style="margin:16px 0;"><a href="${url}/actions" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Review escalated actions</a></p>
     <p style="margin:0;color:#6b7280;">This is an automated daily check.</p>`,
  )

  let notified = 0
  for (const owner of owners) {
    const res = await sendEmail({
      to: owner.email,
      subject: `${escalated} action${escalated === 1 ? "" : "s"} auto-escalated`,
      html,
      kind: "auto_escalation",
      weekEnding: null,
    })
    if (res.ok) notified++
  }
  return { escalated, notified }
}

export const STEPS = {
  reminders: remindUsers,
  "submission-alert": submissionAlert,
  "confirmation-prompt": confirmationPrompt,
  "escalate-unconfirmed": escalateUnconfirmed,
  analysis: runAnalysis,
  "cosmin-narrative": requestCosminNarrative,
  "board-report": sendBoardReport,
  "martin-response": requestMartinResponse,
  "brand-rtb": sendBrandRtbSummary,
  "red-action-reminders": remindRedActionOwners,
  escalate: runDailyEscalation,
} as const

export type StepName = keyof typeof STEPS
