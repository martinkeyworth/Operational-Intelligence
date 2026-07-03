import "server-only"
import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { barbers, user as userTable } from "@/lib/db/schema"
import { sendEmail, emailShell } from "@/lib/email"
import { parseLeadAreas } from "@/lib/access"
import { buildPersonGuide, type PersonGuide, type PersonRoleInput } from "@/lib/role-guide"

function appBaseUrl(): string {
  const raw = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ""
  return raw.replace(/\/$/, "")
}

/** Render one person's combined guide as an email-client-safe HTML body. */
export function renderGuideEmail(guide: PersonGuide): string {
  const base = appBaseUrl()
  const roleLine =
    guide.roleLabels.length > 0
      ? `<p style="margin:0 0 16px;color:#6b7280;">Your role${
          guide.roleLabels.length > 1 ? "s" : ""
        }: <strong style="color:#111827;">${guide.roleLabels.join(" · ")}</strong></p>`
      : ""

  const sections = guide.sections
    .map((s) => {
      const bullets = s.youDo
        .map(
          (item) =>
            `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`,
        )
        .join("")
      return `
        <div style="margin:0 0 20px;padding:0 0 4px;border-bottom:1px solid #f0f0f0;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#111827;">${escapeHtml(s.title)}</p>
          <p style="margin:0 0 10px;color:#374151;">${escapeHtml(s.whatItDoes)}</p>
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;color:#6b7280;">What you do</p>
          <ul style="margin:0 0 10px;padding-left:18px;color:#111827;">${bullets}</ul>
          <p style="margin:0;font-size:12px;color:#6b7280;"><strong>When:</strong> ${escapeHtml(s.cadence)}</p>
        </div>`
    })
    .join("")

  const button = base
    ? `<p style="margin:24px 0 0;"><a href="${base}/team" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Open your Team Area</a></p>`
    : ""

  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(guide.firstName)},</p>
    <p style="margin:0 0 12px;">Here's your personal guide to the Less Than Zero dashboard — what it does, how it works, and exactly what you need to do and when. It's tailored to your role${
      guide.roleLabels.length > 1 ? "s" : ""
    }, so everything below applies to you.</p>
    ${roleLine}
    ${sections}
    ${button}
    <p style="margin:20px 0 0;color:#6b7280;font-size:12px;">You can always find this same guide at the top of your Team Area.</p>`

  return emailShell("Your guide to the dashboard", body)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

type Person = { input: PersonRoleInput; email: string }

/** Load every active barber that has a linked login account, with their
 *  capability flags, so we can build and email each person's guide. */
async function loadActivePeople(): Promise<Person[]> {
  const rows = await db
    .select({
      name: barbers.name,
      role: barbers.role,
      isApprentice: barbers.isApprentice,
      email: userTable.email,
      canViewDashboard: userTable.canViewDashboard,
      isBarber: userTable.isBarber,
      isTrainingLead: userTable.isTrainingLead,
      isHrLead: userTable.isHrLead,
      isSocialMedia: userTable.isSocialMedia,
      leadAreas: userTable.leadAreas,
    })
    .from(barbers)
    .innerJoin(userTable, eq(barbers.userId, userTable.id))
    .where(and(eq(barbers.active, true), isNotNull(barbers.userId)))

  return rows
    .filter((r) => r.email)
    .map((r) => ({
      email: r.email,
      input: {
        name: r.name,
        email: r.email,
        baseRole: r.role,
        isApprentice: r.isApprentice,
        canViewDashboard: r.canViewDashboard,
        isBarber: r.isBarber,
        isTrainingLead: r.isTrainingLead,
        isHrLead: r.isHrLead,
        isSocialMedia: r.isSocialMedia,
        leadAreas: parseLeadAreas(r.leadAreas),
      },
    }))
}

export type GuideSendResult = {
  sent: number
  failed: number
  results: { name: string; email: string; ok: boolean; error?: string }[]
}

/** Build and email each active person their personalised, combined role guide. */
export async function sendRoleGuidesToAll(): Promise<GuideSendResult> {
  const people = await loadActivePeople()
  const results: GuideSendResult["results"] = []

  for (const p of people) {
    const guide = buildPersonGuide(p.input)
    const res = await sendEmail({
      to: p.email,
      subject: "Your guide to the Less Than Zero dashboard",
      html: renderGuideEmail(guide),
      kind: "role-guide",
      weekEnding: null,
    })
    results.push({ name: p.input.name, email: p.email, ok: res.ok, error: res.error })
  }

  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  }
}

/** Send just one person's guide to a specific email (e.g. a preview to the
 *  owner). The guide content is still built from that person's roles. */
export async function sendRoleGuidePreviewTo(toEmail: string): Promise<{ ok: boolean; error?: string }> {
  const people = await loadActivePeople()
  // Use the first person as a sample if the address isn't a known barber, so
  // the owner can see a representative message; otherwise send that person's own.
  const match = people.find((p) => p.email.toLowerCase() === toEmail.toLowerCase())
  const guide = buildPersonGuide(
    match?.input ?? {
      name: "there",
      email: toEmail,
      baseRole: "Barber",
      isApprentice: false,
      canViewDashboard: true,
      isBarber: true,
      isTrainingLead: false,
      isHrLead: false,
      isSocialMedia: false,
      leadAreas: [],
    },
  )
  return sendEmail({
    to: toEmail,
    subject: "Preview — Your guide to the Less Than Zero dashboard",
    html: renderGuideEmail(guide),
    kind: "role-guide-preview",
    weekEnding: null,
  })
}
