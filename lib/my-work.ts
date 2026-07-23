import "server-only"
import { getActions, getLatestWeek, type ActionRow } from "@/lib/data"
import { getSubmissionStatus, submissionHref } from "@/lib/submissions"
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

// Plain, human reasons a leader can actually interpret — no RAG/escalation
// jargon. "Open" is the default for anything simply still to do.
export type MyWorkReason = "Overdue" | "Due soon" | "Needs an owner" | "Open"

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

// Only genuinely actionable entries belong in a personal task feed. The
// imported HR library was loaded with entry_type "Action", but its reference
// artifacts are distinguished by a title prefix (Process: / Form: / Data
// Capture: / Resource:). Those are documentation, not work to do.
const REFERENCE_TITLE = /^(process|form|data capture|resource|policy|template)\s*:/i

function isActionable(a: ActionRow): boolean {
  if (a.status === "Closed") return false
  if (REFERENCE_TITLE.test(a.title)) return false
  return true
}

/** Build the personal attention feed for the signed-in user. */
export async function getMyWork(user: AccessUser): Promise<MyWork> {
  const actions = await getActions()
  const open = actions.filter(isActionable)

  // Effective areas this user can act on (covers leadAreas + legacy flags +
  // owners, who can input everywhere).
  const myAreas = FUNCTION_AREAS.filter((a) => canInputArea(user, a.key)).map(
    (a) => a.key,
  )
  const isAreaLead = !user.isOwner && myAreas.length > 0

  const seen = new Set<number>()

  // Days until an item's due date (negative = overdue). Null when no due date.
  const daysUntilDue = (dueDate: string | null): number | null => {
    if (!dueDate) return null
    const due = new Date(dueDate + "T00:00:00")
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.round((due.getTime() - now.getTime()) / 86_400_000)
  }

  // The single plain reason for an item, based purely on its due date.
  const reasonFor = (a: ActionRow): MyWorkReason => {
    if (a.overdue) return "Overdue"
    const d = daysUntilDue(a.dueDate)
    if (d !== null && d <= 7) return "Due soon"
    return "Open"
  }

  // ---- 1. Assigned to me -------------------------------------------------
  // Everything open that I own — a genuine personal checklist, not just the
  // red/amber ones. Ordered so overdue/soon float to the top.
  const assigned: MyWorkItem[] = []
  for (const a of open) {
    if (a.ownerUserId !== user.id) continue
    assigned.push(toItem(a, [reasonFor(a)]))
    seen.add(a.id)
  }

  // ---- 2. In my areas (needs an owner) -----------------------------------
  // Unassigned open items in the areas I lead, so nothing slips — surfaced as a
  // plain "needs an owner" list rather than red/escalation flags.
  const watch: MyWorkItem[] = []
  for (const a of open) {
    if (seen.has(a.id)) continue
    if (a.ownerUserId) continue
    const areaKey = canonicalAreaKey(a.functionArea)
    const inMyArea = user.isOwner || (isAreaLead && myAreas.includes(areaKey))
    if (!inMyArea) continue
    watch.push(toItem(a, ["Needs an owner"]))
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
          (item.key === "kpi-Training" && myAreas.includes("Training")) ||
          (item.key === "kpi-Marketing" && myAreas.includes("Marketing")) ||
          (item.key.startsWith("training-") && myAreas.includes("Training"))
        if (!relevant) continue
        submissions.push({
          key: item.key,
          label: item.label,
          detail: item.detail,
          // Route straight to the exact entry page + week (same resolver the
          // submissions board uses), so every lead lands where they enter.
          href: submissionHref(item, week),
        })
      }
    }
  }

  const rank: Record<string, number> = { Overdue: 0, "Due soon": 1, "Needs an owner": 2, Open: 3 }
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
