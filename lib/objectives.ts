// Strategic Objectives layer.
//
// Objectives are the board-level goals the whole governance model exists to
// protect. They are defined here as config (like FUNCTION_AREAS) and their
// live status is COMPUTED from the operating data — the scorecard areas, the
// expansion/glide-path engine, the recruitment plan and the action register —
// so a red metric automatically rolls UP into "which strategic objective is at
// risk". This is what lets the platform answer that question without Martin.

import type { Rag } from "@/lib/data"
import type { BusinessScorecard, ActionRow } from "@/lib/data"
import type { VisionGlidePath, ExpansionRecommendation } from "@/lib/vision"
import type { RecruitmentPlan } from "@/lib/hr"
import { canonicalAreaKey } from "@/lib/function-areas"

export type ObjectiveDef = {
  key: string
  title: string
  // The board-level "why".
  statement: string
  // The named accountable leader (role, not a person, so it survives turnover).
  ownerRole: string
  // Functional-area keys whose RAG feeds this objective.
  areaKeys: string[]
  icon: string
}

export const STRATEGIC_OBJECTIVES: ObjectiveDef[] = [
  {
    key: "scale-rtb",
    title: "Reach £2.5m RTB by 2030",
    statement:
      "Grow revenue-to-business to the 2030 goal by filling every chair and holding the £500/barber/week contribution.",
    ownerRole: "CEO / Finance",
    areaKeys: ["Capacity", "RTB"],
    icon: "TrendingUp",
  },
  {
    key: "estate-expansion",
    title: "Open shops ahead of demand",
    statement:
      "Keep chair capacity ahead of the headcount glide path so growth is never capacity-constrained.",
    ownerRole: "Operations",
    areaKeys: ["Capacity"],
    icon: "Building2",
  },
  {
    key: "academy-engine",
    title: "Academy fuels the workforce",
    statement:
      "Run the academy at capacity so training income and the apprentice pipeline self-fund recruitment.",
    ownerRole: "Training Lead",
    areaKeys: ["Training"],
    icon: "GraduationCap",
  },
  {
    key: "people-pipeline",
    title: "Fully staff every shop to model",
    statement:
      "Recruit and retain the manager, brand cutting staff and apprentice each shop needs to run to plan.",
    ownerRole: "HR Lead",
    areaKeys: ["HR"],
    icon: "Users",
  },
  {
    key: "ancillary-income",
    title: "Maximise ancillary income",
    statement:
      "Protect subletting and marketing-driven demand as supporting income lines across the estate.",
    ownerRole: "Operations / Marketing",
    areaKeys: ["Subletting", "Marketing"],
    icon: "Banknote",
  },
]

export type ObjectiveDriver = {
  label: string
  rag: Rag
  detail: string
}

export type ObjectiveStatus = {
  key: string
  title: string
  statement: string
  ownerRole: string
  icon: string
  rag: Rag
  // One-line "why" summarising the worst driver.
  headline: string
  drivers: ObjectiveDriver[]
  // Open + overdue actions tagged to this objective's areas.
  openActions: number
  overdueActions: number
}

const RAG_RANK: Record<Rag, number> = { red: 0, amber: 1, green: 2 }
function worst(rags: Rag[]): Rag {
  if (rags.length === 0) return "green"
  return rags.reduce((w, r) => (RAG_RANK[r] < RAG_RANK[w] ? r : w), "green" as Rag)
}

/**
 * Roll the live operating picture up into strategic-objective status. Pure
 * function so it can be called from any server component with already-fetched
 * data.
 */
export function getStrategicObjectives(input: {
  scorecard: BusinessScorecard
  vision: VisionGlidePath
  expansion: ExpansionRecommendation
  recruitment: RecruitmentPlan
  actions: ActionRow[]
}): ObjectiveStatus[] {
  const { scorecard, vision, expansion, recruitment, actions } = input
  const areaByKey = new Map(scorecard.areas.map((a) => [a.key, a]))

  return STRATEGIC_OBJECTIVES.map((obj) => {
    const drivers: ObjectiveDriver[] = []

    // Functional-area RAGs that underpin the objective.
    for (const key of obj.areaKeys) {
      const area = areaByKey.get(key)
      if (area) {
        drivers.push({ label: area.label, rag: area.rag, detail: area.detail })
      }
    }

    // Objective-specific strategic signals layered on top of area RAGs.
    if (obj.key === "scale-rtb") {
      const onTrack = vision.currentHeadcount >= vision.barbersNeeded
      const pct =
        vision.barbersNeeded > 0
          ? Math.round((vision.currentHeadcount / vision.barbersNeeded) * 100)
          : 0
      drivers.push({
        label: "Headcount vs 2030 need",
        rag: onTrack ? "green" : pct >= 60 ? "amber" : "red",
        detail: `${vision.currentHeadcount} of ${vision.barbersNeeded} barbers needed (${pct}%)`,
      })
    }
    if (obj.key === "estate-expansion") {
      drivers.push({
        label: "Capacity headroom",
        rag: expansion.rag,
        detail: expansion.headline,
      })
    }
    if (obj.key === "people-pipeline") {
      const rag: Rag =
        recruitment.totalGap === 0
          ? "green"
          : recruitment.totalGap <= 3
            ? "amber"
            : "red"
      drivers.push({
        label: "Roles to recruit",
        rag,
        detail:
          recruitment.totalGap === 0
            ? "All shops staffed to the plan model"
            : `${recruitment.totalGap} roles below the plan model`,
      })
    }

    // Action pressure tagged to this objective's areas.
    const objActions = actions.filter(
      (a) =>
        a.status !== "Closed" &&
        obj.areaKeys.includes(canonicalAreaKey(a.functionArea)),
    )
    const overdueActions = objActions.filter((a) => a.overdue).length
    if (overdueActions > 0) {
      drivers.push({
        label: "Overdue actions",
        rag: "red",
        detail: `${overdueActions} action${overdueActions === 1 ? "" : "s"} past due date`,
      })
    }

    const rag = worst(drivers.map((d) => d.rag))
    const worstDriver =
      [...drivers].sort((a, b) => RAG_RANK[a.rag] - RAG_RANK[b.rag])[0] ?? null
    const headline =
      rag === "green"
        ? "On track"
        : worstDriver
          ? `${worstDriver.label}: ${worstDriver.detail}`
          : "At risk"

    return {
      key: obj.key,
      title: obj.title,
      statement: obj.statement,
      ownerRole: obj.ownerRole,
      icon: obj.icon,
      rag,
      headline,
      drivers,
      openActions: objActions.length,
      overdueActions,
    }
  })
}
