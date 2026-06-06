import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { weeklyReports } from "@/lib/db/schema"
import { fmtWeekLong } from "@/lib/data"
import { sendEmail, emailShell, ragChip } from "@/lib/email"
import {
  currentWeekEnding,
  getOrCreateReport,
  getCompanyRecipients,
  buildComparison,
  runWeeklyAnalysis,
  reviewNarrative,
  appBaseUrl,
} from "@/lib/reporting"

/**
 * Saturday workflow steps. Each is idempotent and keyed off weekly_reports so
 * the cron can call them at the right times (UK):
 *  - 17:00 remindUsers          → nudge everyone to update their section
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

  const recipients = await getCompanyRecipients()
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

export const STEPS = {
  reminders: remindUsers,
  analysis: runAnalysis,
  "cosmin-narrative": requestCosminNarrative,
  "board-report": sendBoardReport,
  "martin-response": requestMartinResponse,
} as const

export type StepName = keyof typeof STEPS
