import "server-only"
import { getActions, getLatestWeek, type ActionRow } from "@/lib/data"
import { getSubmissionStatus } from "@/lib/submissions"
import { FUNCTION_AREAS, canonicalAreaKey } from "@/lib/function-areas"
import { canInputArea } from "@/lib/access"
import type { AccessUser } from "@/lib/access-types"

// ---------------------------------------------------------------------------
// "What needs my attention" — a single, personal feed shown to every user on
// login. It answers one question: what should *I* act on right now?
//
//  - Assigned to me   : my own open items that are red / amber / overdue /
//                       escalated (everyone).
//  - In my areas      : open red or overdue items in the areas I lead that are
//                       currently unassigned, so nothing slips (area leads).
//  - Escalations      : escalated items across the whole business (owners).
//  - Weekly data      : this week's submissions still outstanding for the role
//                       I hold (leads + owners).
//
// If all of the above is empty, the user is genuinely clear — and we say so.
// ---------------------------------------------------------------------------

export type MyWorkReason = "Overdue" | "Escalated" | "Red" | "Amber" | "Unassigned"

export type MyWorkItem = {
  id: number
  title: string
  areaKey: string
  areaLabel: string
  siteName: string | null
  entryType: string
  rag: ActionRow["rag"]
  status: string
  ownerLabel: string
  dueDate: string | null
  overdue: boolean
  daysOverdue: number
  escalated: boolean
  reasons: MyWorkReason[]
}

export type MyWorkSubmission = {
  key: string
  label: string
  detail: string
  href: string
}

export type MyWork = {
  assigned: MyWorkItem[]
  watch: MyWorkItem[]
  submissions: MyWorkSubmission[]
  totalCount: number
  weekLabel: string | null
}

const areaLabel = (key: string) =>
  FUNCTION_AREAS.find((a) => a.key === key)?.label ?? key

function toItem(a: ActionRow, reasons: MyWorkReason[]): MyWorkItem {
  const areaKey = canonicalAreaKey(a.functionArea)
  return {
    id: a.id,
    title: a.title,
    areaKey,
    areaLabel: areaLabel(areaKey),
    siteName: a.siteName,
    entryType: a.entryType ?? "Action",
    rag: a.rag,
    status: a.status,
    ownerLabel: a.ownerLabel,
    dueDate: a.dueDate,
    overdue: a.overdue,
    daysOverdue: a.daysOverdue,
    escalated: a.escalated,
    reasons,
  }
}

/** Build the personal attention feed for the signed-in user. */
export async function getMyWork(user: AccessUser): Promise<MyWork> {
  const actions = await getActions()
  const open = actions.filter((a) => a.status !== "Closed")

  // Effective areas this user can act on (covers leadAreas + legacy flags +
  // owners, who can input everywhere).
  const myAreas = FUNCTION_AREAS.filter((a) => canInputArea(user, a.key)).map(
    (a) => a.key,
  )
  const isAreaLead = !user.isOwner && myAreas.length > 0

  const seen = new Set<number>()

  // ---- 1. Assigned to me -------------------------------------------------
  const assigned: MyWorkItem[] = []
  for (const a of open) {
    if (a.ownerUserId !== user.id) continue
    const reasons: MyWorkReason[] = []
    if (a.overdue) reasons.push("Overdue")
    if (a.escalated) reasons.push("Escalated")
    if (a.rag === "red") reasons.push("Red")
    else if (a.rag === "amber") reasons.push("Amber")
    if (reasons.length === 0) continue
    assigned.push(toItem(a, reasons))
    seen.add(a.id)
  }

  // ---- 2. Watch list (unassigned in my areas + owner escalations) --------
  const watch: MyWorkItem[] = []
  for (const a of open) {
    if (seen.has(a.id)) continue
    const areaKey = canonicalAreaKey(a.functionArea)
    const reasons: MyWorkReason[] = []

    // Owners: every escalated item across the business.
    if (user.isOwner && a.escalated) reasons.push("Escalated")

    // Area leads / owners: unassigned red or overdue items in their areas.
    const inMyArea = user.isOwner || (isAreaLead && myAreas.includes(areaKey))
    const unassigned = !a.ownerUserId
    if (inMyArea && unassigned) {
      if (a.overdue) reasons.push("Overdue")
      if (a.rag === "red") reasons.push("Red")
      if (reasons.includes("Red") || reasons.includes("Overdue"))
        reasons.push("Unassigned")
    }

    if (reasons.length === 0) continue
    watch.push(toItem(a, Array.from(new Set(reasons))))
    seen.add(a.id)
  }

  // ---- 3. Outstanding weekly submissions for my role ---------------------
  const submissions: MyWorkSubmission[] = []
  let weekLabel: string | null = null
  if (user.isOwner || isAreaLead) {
    const week = await getLatestWeek()
    if (week) {
      const status = await getSubmissionStatus(week)
      weekLabel = status.weekLabel
      for (const item of status.outstanding) {
        const relevant =
          user.isOwner ||
          (item.key === "kpi-HR" && myAreas.includes("HR")) ||
          (item.key === "kpi-Marketing" && myAreas.includes("Marketing")) ||
          (item.key.startsWith("training-") && myAreas.includes("Training"))
        if (!relevant) continue
        const href = item.key.startsWith("kpi-")
          ? "/data-entry"
          : item.key.startsWith("training-")
            ? "/data-entry"
            : "/reports/submissions"
        submissions.push({
          key: item.key,
          label: item.label,
          detail: item.detail,
          href,
        })
      }
    }
  }

  const rank: Record<string, number> = { Overdue: 0, Escalated: 1, Red: 2, Amber: 3, Unassigned: 4 }
  const sortItems = (a: MyWorkItem, b: MyWorkItem) =>
    (rank[a.reasons[0]] ?? 9) - (rank[b.reasons[0]] ?? 9) ||
    b.daysOverdue - a.daysOverdue

  assigned.sort(sortItems)
  watch.sort(sortItems)

  return {
    assigned,
    watch,
    submissions,
    totalCount: assigned.length + watch.length + submissions.length,
    weekLabel,
  }
}
