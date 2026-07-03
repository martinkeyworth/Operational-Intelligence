// ---------------------------------------------------------------------------
// L&D shared vocabulary — CLIENT-SAFE (no "server-only", no db imports).
//
// Holds the PBC model, the versioned monthly 1-2-1 question set, and the pure
// helpers that map answers -> suggested PBC scores. Imported by both server
// data/actions and client components.
// ---------------------------------------------------------------------------

// --- PBC model -------------------------------------------------------------
// Performance / Behaviours / Contribution, each scored 1 (best) - 5 (lowest).

export type PbcDimension = "performance" | "behaviours" | "contribution"

export const PBC_DIMENSIONS: { key: PbcDimension; label: string; blurb: string }[] = [
  {
    key: "performance",
    label: "Performance",
    blurb: "Delivery against objectives — chair revenue/RTB, targets and outcomes.",
  },
  {
    key: "behaviours",
    label: "Behaviours",
    blurb: "How they work — app/data discipline, ownership, values and teamwork.",
  },
  {
    key: "contribution",
    label: "Contribution",
    blurb: "Wider impact — mentoring, innovation, development and the estate.",
  },
]

// The LTZ 1-5 band descriptors, shown as the rating guide + tooltips.
export const PBC_BANDS: { score: number; label: string; description: string }[] = [
  {
    score: 1,
    label: "Outperformed",
    description:
      "All objectives achieved and surpassed by ≥5%; clear commitment to the business; has innovated; completed 360 feedback; mentors a junior AND is a mentee to a senior (or aligned external figure); active on their L&D plan.",
  },
  {
    score: 2,
    label: "Exceeded",
    description:
      "Objectives fully met and several stretched; strong behaviours and contribution; most band-1 evidence present.",
  },
  {
    score: 3,
    label: "Achieved (expected standard)",
    description:
      "Meets objectives and the baseline: consistent use of this app, data submitted on time, enrolled on a relevant qualification AND progressing, undertaking CPD.",
  },
  {
    score: 4,
    label: "Below expectations",
    description: "Falls short on the baseline criteria; targeted improvement needed.",
  },
  {
    score: 5,
    label: "Unacceptable",
    description: "Significant shortfalls across dimensions (e.g. 3+ areas failing); formal improvement plan.",
  },
]

export function pbcBand(score: number | null | undefined) {
  if (!score) return null
  return PBC_BANDS.find((b) => b.score === score) ?? null
}

export const PBC_SCORES = [1, 2, 3, 4, 5] as const

// --- Monthly 1-2-1 question set (versioned) --------------------------------
// Bump the version whenever wording changes; historical 1-2-1s keep the
// version they were completed under so their answers stay meaningful.

export const ONE_TO_ONE_TEMPLATE_VERSION = 1

export type QuestionType = "rating" | "yesno" | "text"

export type OneToOneQuestion = {
  id: string
  group: "Business goals" | "Behaviours" | "Development"
  prompt: string
  type: QuestionType
  // Which PBC dimension a rating/yesno answer contributes to (text is context only).
  dimension?: PbcDimension
  help?: string
}

export const ONE_TO_ONE_QUESTIONS: OneToOneQuestion[] = [
  // Business goals -> Performance
  {
    id: "objectives_met",
    group: "Business goals",
    prompt: "Were last month's objectives achieved (and surpassed by ≥5%)?",
    type: "rating",
    dimension: "performance",
    help: "1 = surpassed all by ≥5%, 3 = met, 5 = largely missed.",
  },
  {
    id: "chair_revenue",
    group: "Business goals",
    prompt: "Contribution to chair revenue / RTB vs target.",
    type: "rating",
    dimension: "performance",
    help: "1 = well above target, 3 = on target, 5 = well below.",
  },
  {
    id: "growth_pipeline",
    group: "Business goals",
    prompt: "Contribution to academy, recruitment or growth pipeline.",
    type: "rating",
    dimension: "performance",
  },
  {
    id: "objectives_next",
    group: "Business goals",
    prompt: "Objectives for the coming month.",
    type: "text",
  },
  // Behaviours -> Behaviours + Contribution
  {
    id: "app_usage",
    group: "Behaviours",
    prompt: "Consistent use of this app and data submitted on time?",
    type: "yesno",
    dimension: "behaviours",
  },
  {
    id: "ownership",
    group: "Behaviours",
    prompt: "Ownership of their RAID items / actions.",
    type: "rating",
    dimension: "behaviours",
  },
  {
    id: "values_teamwork",
    group: "Behaviours",
    prompt: "Teamwork and living the LTZ values.",
    type: "rating",
    dimension: "behaviours",
  },
  {
    id: "mentoring",
    group: "Behaviours",
    prompt: "Mentoring a junior and/or being a mentee?",
    type: "rating",
    dimension: "contribution",
  },
  {
    id: "innovation",
    group: "Behaviours",
    prompt: "Innovation / ideas brought forward.",
    type: "rating",
    dimension: "contribution",
  },
  // Development -> Contribution + updates the plan
  {
    id: "plan_progress",
    group: "Development",
    prompt: "Progress on their L&D plan and qualification.",
    type: "rating",
    dimension: "contribution",
  },
  {
    id: "cpd",
    group: "Development",
    prompt: "CPD undertaken since the last 1-2-1?",
    type: "yesno",
    dimension: "contribution",
  },
  {
    id: "next_role_gates",
    group: "Development",
    prompt: "Progress toward the gates for their next role.",
    type: "text",
  },
  {
    id: "blockers",
    group: "Development",
    prompt: "Blockers or support needed.",
    type: "text",
  },
]

export const ONE_TO_ONE_GROUPS = ["Business goals", "Behaviours", "Development"] as const

// A map of questionId -> answer. Ratings/yesno stored as numbers/booleans,
// text as strings.
export type OneToOneAnswers = Record<string, number | boolean | string | null | undefined>

// The barber's self-prep payload persisted on one_to_ones.self_prep. Includes
// their own PBC self-scores + reasons for the two-stage scoring flow.
export type SelfPrep = {
  answers?: OneToOneAnswers
  selfPerformance?: number | null
  selfBehaviours?: number | null
  selfContribution?: number | null
  selfReason?: string | null
  submittedAt?: string | null
}

// The manager's answers payload persisted on one_to_ones.manager_answers.
export type ManagerAnswers = {
  answers?: OneToOneAnswers
  // Manager's note explaining any difference from the barber's self-score.
  differenceReason?: string | null
}

// --- Pure scoring helper ---------------------------------------------------

function answerToScore(q: OneToOneQuestion, value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  if (q.type === "rating") {
    const n = Number(value)
    return n >= 1 && n <= 5 ? n : null
  }
  if (q.type === "yesno") {
    // Yes = meeting the standard (good = 2), No = below (4). Neutral midpoint.
    return value === true || value === "true" || value === "yes" ? 2 : 4
  }
  return null
}

/** Derive suggested PBC scores (1-5, rounded) from a set of 1-2-1 answers by
 *  averaging the mapped answers per dimension. Missing dimensions default to 3. */
export function suggestPbcFromAnswers(answers: OneToOneAnswers): {
  performance: number
  behaviours: number
  contribution: number
  overall: number
} {
  const buckets: Record<PbcDimension, number[]> = {
    performance: [],
    behaviours: [],
    contribution: [],
  }
  for (const q of ONE_TO_ONE_QUESTIONS) {
    if (!q.dimension) continue
    const score = answerToScore(q, answers?.[q.id])
    if (score != null) buckets[q.dimension].push(score)
  }
  const mean = (arr: number[]) => {
    if (arr.length === 0) return 3
    const m = arr.reduce((s, n) => s + n, 0) / arr.length
    return Math.min(5, Math.max(1, Math.round(m)))
  }
  const performance = mean(buckets.performance)
  const behaviours = mean(buckets.behaviours)
  const contribution = mean(buckets.contribution)
  const overall = Math.min(5, Math.max(1, Math.round((performance + behaviours + contribution) / 3)))
  return { performance, behaviours, contribution, overall }
}

// --- Period helpers --------------------------------------------------------

/** Current period as YYYY-MM. */
export function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

/** YYYY-MM derived from a date. */
export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** "2026-07" -> "July 2026". */
export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number)
  if (!y || !m) return period
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

// --- Plan item statuses ----------------------------------------------------

export const PLAN_ITEM_STATUSES = ["planned", "in_progress", "complete"] as const
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number]

export const PLAN_ITEM_STATUS_LABELS: Record<PlanItemStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  complete: "Complete",
}

export const COURSE_REQUIREMENTS = ["required", "recommended"] as const
export type CourseRequirement = (typeof COURSE_REQUIREMENTS)[number]
