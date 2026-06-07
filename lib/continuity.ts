import "server-only"
import {
  getActions,
  getFunctionAreaSummaries,
  getBusinessScorecard,
  getLatestWeek,
  fmtWeekLong,
  type ActionRow,
  type FunctionAreaSummary,
  type Rag,
} from "@/lib/data"
import {
  getVisionGlidePath,
  getExpansionPlan,
} from "@/lib/vision"
import { getRecruitmentPlan } from "@/lib/hr"
import { getStrategicObjectives, type ObjectiveStatus } from "@/lib/objectives"

// The CEO Continuity Briefing answers the six "if Martin disappeared for 30
// days" questions from a single live snapshot:
//   1. What is off track?            → offTrackAreas
//   2. Why is it off track?          → each area's topIssue + objective drivers
//   3. Who owns recovery?            → ownerRole per area / objective + action owners
//   4. What actions are overdue?     → overdueActions
//   5. What objectives are at risk?  → objectivesAtRisk
//   6. What must happen next?        → nextActions

export type ContinuityBriefing = {
  week: string
  weekLabel: string
  overallRag: Rag
  overallPct: number
  // (1) Off-track functional areas (red first, then amber).
  offTrackAreas: FunctionAreaSummary[]
  // (4) Open actions past their due date, most overdue first.
  overdueActions: ActionRow[]
  // (5) Strategic objectives that are amber/red.
  objectivesAtRisk: ObjectiveStatus[]
  allObjectives: ObjectiveStatus[]
  // (6) The prioritised "do next" list — overdue, then escalated, then open reds.
  nextActions: ActionRow[]
  // Headline counts for the summary band.
  counts: {
    areasOffTrack: number
    objectivesAtRisk: number
    overdue: number
    escalated: number
    unassigned: number
  }
}

const RAG_RANK: Record<Rag, number> = { red: 0, amber: 1, green: 2 }

export async function getContinuityBriefing(): Promise<ContinuityBriefing | null> {
  const week = await getLatestWeek()
  if (!week) return null

  const [areas, actions, scorecard, vision, expansion, recruitment] =
    await Promise.all([
      getFunctionAreaSummaries(),
      getActions(),
      getBusinessScorecard(week),
      getVisionGlidePath(),
      getExpansionPlan(),
      getRecruitmentPlan(),
    ])

  const objectives = getStrategicObjectives({
    scorecard,
    vision,
    expansion,
    recruitment,
    actions,
  })

  const offTrackAreas = areas
    .filter((a) => a.rag !== "green")
    .sort((a, b) => RAG_RANK[a.rag] - RAG_RANK[b.rag])

  const objectivesAtRisk = objectives
    .filter((o) => o.rag !== "green")
    .sort((a, b) => RAG_RANK[a.rag] - RAG_RANK[b.rag])

  const open = actions.filter((a) => a.status !== "Closed")
  const overdueActions = open
    .filter((a) => a.overdue)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  // (6) "What must happen next": overdue, then escalated, then open reds —
  // de-duplicated, capped to a focused list.
  const nextSeen = new Set<number>()
  const nextActions: ActionRow[] = []
  for (const a of [
    ...overdueActions,
    ...open.filter((a) => a.escalated),
    ...open.filter((a) => a.rag === "red"),
  ]) {
    if (nextSeen.has(a.id)) continue
    nextSeen.add(a.id)
    nextActions.push(a)
    if (nextActions.length >= 8) break
  }

  return {
    week,
    weekLabel: fmtWeekLong(week),
    overallRag: scorecard.overallRag,
    overallPct: scorecard.overallPct,
    offTrackAreas,
    overdueActions,
    objectivesAtRisk,
    allObjectives: objectives,
    nextActions,
    counts: {
      areasOffTrack: offTrackAreas.length,
      objectivesAtRisk: objectivesAtRisk.length,
      overdue: overdueActions.length,
      escalated: open.filter((a) => a.escalated).length,
      unassigned: open.filter((a) => !a.ownerUserId).length,
    },
  }
}
