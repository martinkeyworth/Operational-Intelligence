import "server-only"
import { db } from "@/lib/db"
import { sites, barbers } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { tierForBrand, OPENING_SCHEDULE } from "@/lib/plan"

// ---------------------------------------------------------------------------
// HR / recruitment model
// ---------------------------------------------------------------------------
// The cadence must drive recruitment across the whole role ladder, not just
// "vacant chairs". Every shop targets:
//   • 1 Manager
//   • enough cutting staff to fill the remaining chairs (brand-specific title)
//   • at least 1 Apprentice (a success criterion for every shop)
// The Training Academy then needs Trainers & Assessors scaled to the total
// apprentice population it has to support.

export type RoleBucket =
  | "Manager"
  | "Senior Barber"
  | "Barber"
  | "Junior Barber"
  | "Apprentice"
  | "Trainer"
  | "Assessor"

// The full ladder, in seniority order, used for stable display.
export const ROLE_LADDER: RoleBucket[] = [
  "Manager",
  "Senior Barber",
  "Barber",
  "Junior Barber",
  "Apprentice",
  "Trainer",
  "Assessor",
]

// Each brand's cutting-chair role. Managers and apprentices are common to all
// brands; the title of the chair-filling staff differs by brand positioning.
export const BRAND_CUTTING_ROLE: Record<string, RoleBucket> = {
  // Less Than Zero (Mid) — senior, experienced floor.
  "less than zero": "Senior Barber",
  ltz: "Senior Barber",
  // Velvet Ash (Elite) — standard "barber" title.
  "velvet ash": "Barber",
  // F.AF (Youth) — junior/academy-fed floor.
  "f.af": "Junior Barber",
  faf: "Junior Barber",
}

export function cuttingRoleForBrand(brand: string | null | undefined): RoleBucket {
  if (!brand) return "Barber"
  return BRAND_CUTTING_ROLE[brand.trim().toLowerCase()] ?? "Barber"
}

// ---------------------------------------------------------------------------
// Training Academy capacity & staffing ratios (board-confirmed)
// ---------------------------------------------------------------------------
// A trainer covers EITHER a block of learners OR a block of apprentices, so the
// required trainers is the larger of the two demands (combined block model).
export const LEARNERS_PER_TRAINER = 50
export const APPRENTICES_PER_TRAINER = 10
export const APPRENTICES_PER_ASSESSOR = 40

// Academy throughput basis used to plan academy staff:
//   • Learners: 10 per cohort × AM/PM/Eve (3) × 5 days = 150 learners/week
//   • Apprentices: 10 AM + 10 PM, 1 day/week = 20 apprentices
export const LEARNERS_PER_COHORT = 10
export const COHORTS_PER_DAY = 3 // AM, PM, Evening
export const ACADEMY_DAYS_PER_WEEK = 5
export const LEARNER_WEEKLY_CAPACITY =
  LEARNERS_PER_COHORT * COHORTS_PER_DAY * ACADEMY_DAYS_PER_WEEK // 150
export const ACADEMY_APPRENTICE_CAPACITY = 10 + 10 // AM + PM, 1 day/week = 20

/**
 * Normalise a free-text `barbers.role` value onto a model bucket. Existing data
 * uses titles like "Master Barber" which all count as cutting staff.
 */
export function normaliseRole(
  raw: string | null | undefined,
  brandCuttingRole: RoleBucket,
): RoleBucket {
  const r = (raw ?? "").trim().toLowerCase()
  if (!r) return brandCuttingRole
  if (r.includes("manager")) return "Manager"
  if (r.includes("apprentice")) return "Apprentice"
  if (r.includes("trainer")) return "Trainer"
  if (r.includes("assessor")) return "Assessor"
  // Any other cutting title (Master/Senior/Junior/Barber) maps to the brand's
  // canonical cutting role so gaps are measured consistently per brand.
  return brandCuttingRole
}

export type SiteRolePlan = {
  siteId: number
  siteName: string
  brand: string
  cuttingRole: RoleBucket
  chairCapacity: number
  rolesTracked: boolean // false when the site only has a headcount, no role rows
  // role -> { have, need, gap }
  lines: {
    role: RoleBucket
    have: number
    need: number
    gap: number
  }[]
  totalGap: number
}

export type AcademyPlan = {
  // Demand basis
  learnersPerWeek: number
  apprenticesActive: number
  apprenticesTarget: number
  // Trainer demand split (combined-block: required = max of the two)
  trainersFromLearners: number
  trainersFromApprentices: number
  trainersNeed: number
  trainersHave: number
  assessorsNeed: number
  assessorsHave: number
}

export type PipelineRole = {
  role: RoleBucket
  count: number
}

export type PlannedOpeningPlan = {
  location: string
  tier: string
  year: number
  month: number
  cuttingRole: RoleBucket
  roles: PipelineRole[]
  totalRoles: number
}

export type RecruitmentPlan = {
  sites: SiteRolePlan[]
  // Group totals by role across all shops + academy.
  byRole: { role: RoleBucket; have: number; need: number; gap: number }[]
  totalGap: number
  apprenticesHave: number
  apprenticesNeed: number
  academy: AcademyPlan
  pipeline: PlannedOpeningPlan[]
  pipelineByRole: { role: RoleBucket; count: number }[]
}

/**
 * Build the role-aware recruitment plan for all open barbershops, plus the
 * Academy trainer/assessor requirement derived from the apprentice population.
 */
export async function getRecruitmentPlan(): Promise<RecruitmentPlan> {
  const siteRows = await db
    .select()
    .from(sites)
    .where(eq(sites.siteType, "barbershop"))
    .orderBy(sites.name)

  const roleRows = await db
    .select({
      siteId: barbers.siteId,
      role: barbers.role,
      count: sql<number>`count(*)`,
    })
    .from(barbers)
    .where(eq(barbers.active, true))
    .groupBy(barbers.siteId, barbers.role)

  const sitePlans: SiteRolePlan[] = siteRows.map((s) => {
    const brandCuttingRole = cuttingRoleForBrand(s.brand)
    const chairCapacity = s.chairCapacity ?? 0
    const mine = roleRows.filter((r) => r.siteId === s.id)
    const rolesTracked = mine.length > 0

    // Tally actual staff into buckets.
    const have: Record<RoleBucket, number> = {
      Manager: 0,
      "Senior Barber": 0,
      Barber: 0,
      "Junior Barber": 0,
      Apprentice: 0,
      Trainer: 0,
      Assessor: 0,
    }

    if (rolesTracked) {
      for (const r of mine) {
        const bucket = normaliseRole(r.role, brandCuttingRole)
        have[bucket] += Number(r.count)
      }
    } else {
      // Headcount-only site: treat the recorded headcount as undifferentiated
      // cutting staff so we still flag the missing manager/apprentice.
      have[brandCuttingRole] += s.headcount ?? 0
    }

    // Targets: 1 manager, fill remaining chairs with brand cutting role
    // (manager occupies one chair), and at least 1 apprentice per shop.
    const managerNeed = 1
    const cuttingNeed = Math.max(0, chairCapacity - managerNeed)
    const apprenticeNeed = 1

    const need: Partial<Record<RoleBucket, number>> = {
      Manager: managerNeed,
      [brandCuttingRole]: cuttingNeed,
      Apprentice: apprenticeNeed,
    }

    const relevantRoles: RoleBucket[] = [
      "Manager",
      brandCuttingRole,
      "Apprentice",
    ]

    const lines = relevantRoles.map((role) => {
      const h = have[role]
      const n = need[role] ?? 0
      return { role, have: h, need: n, gap: Math.max(0, n - h) }
    })

    const totalGap = lines.reduce((a, l) => a + l.gap, 0)

    return {
      siteId: s.id,
      siteName: s.name,
      brand: s.brand,
      cuttingRole: brandCuttingRole,
      chairCapacity,
      rolesTracked,
      lines,
      totalGap,
    }
  })

  // Aggregate by role across sites.
  const roleAgg = new Map<RoleBucket, { have: number; need: number }>()
  for (const sp of sitePlans) {
    for (const l of sp.lines) {
      const cur = roleAgg.get(l.role) ?? { have: 0, need: 0 }
      cur.have += l.have
      cur.need += l.need
      roleAgg.set(l.role, cur)
    }
  }

  // Apprentice population drives Academy trainer/assessor demand.
  const apprenticesHave = roleAgg.get("Apprentice")?.have ?? 0
  const apprenticesNeed = roleAgg.get("Apprentice")?.need ?? 0

  // Academy staff are planned against the academy's throughput capacity, not
  // just shop apprentices: 150 learners/week + 20 apprentices in training.
  // Recruit trainers ahead of intake by using the larger apprentice basis.
  const apprenticeBasis = Math.max(
    apprenticesHave,
    apprenticesNeed,
    ACADEMY_APPRENTICE_CAPACITY,
  )
  const trainersFromLearners = Math.ceil(
    LEARNER_WEEKLY_CAPACITY / LEARNERS_PER_TRAINER,
  )
  const trainersFromApprentices = Math.ceil(
    apprenticeBasis / APPRENTICES_PER_TRAINER,
  )
  // Combined-block model: a trainer covers a block of learners OR apprentices,
  // so the requirement is the larger of the two demands.
  const trainersNeed = Math.max(trainersFromLearners, trainersFromApprentices)
  const assessorsNeed = Math.ceil(apprenticeBasis / APPRENTICES_PER_ASSESSOR)

  const academyRoleRows = await db
    .select({ role: barbers.role, count: sql<number>`count(*)` })
    .from(barbers)
    .innerJoin(sites, eq(barbers.siteId, sites.id))
    .where(eq(sites.siteType, "training"))
    .groupBy(barbers.role)

  let trainersHave = 0
  let assessorsHave = 0
  for (const r of academyRoleRows) {
    const role = (r.role ?? "").toLowerCase()
    if (role.includes("assessor")) assessorsHave += Number(r.count)
    else if (role.includes("trainer")) trainersHave += Number(r.count)
  }
  roleAgg.set("Trainer", { have: trainersHave, need: trainersNeed })
  roleAgg.set("Assessor", { have: assessorsHave, need: assessorsNeed })

  const academy: AcademyPlan = {
    learnersPerWeek: LEARNER_WEEKLY_CAPACITY,
    apprenticesActive: apprenticesHave,
    apprenticesTarget: apprenticeBasis,
    trainersFromLearners,
    trainersFromApprentices,
    trainersNeed,
    trainersHave,
    assessorsNeed,
    assessorsHave,
  }

  const byRole = ROLE_LADDER.filter((role) => roleAgg.has(role)).map((role) => {
    const { have, need } = roleAgg.get(role)!
    return { role, have, need, gap: Math.max(0, need - have) }
  })

  const totalGap = byRole.reduce((a, r) => a + r.gap, 0)

  // Forward pipeline: roles needed for upcoming planned openings.
  const pipeline = buildPipeline()
  const pipelineAgg = new Map<RoleBucket, number>()
  for (const op of pipeline) {
    for (const r of op.roles) {
      pipelineAgg.set(r.role, (pipelineAgg.get(r.role) ?? 0) + r.count)
    }
  }
  const pipelineByRole = ROLE_LADDER.filter((role) => pipelineAgg.has(role)).map(
    (role) => ({ role, count: pipelineAgg.get(role)! }),
  )

  return {
    sites: sitePlans,
    byRole,
    totalGap,
    apprenticesHave,
    apprenticesNeed,
    academy,
    pipeline,
    pipelineByRole,
  }
}

/**
 * Build the forward recruitment pipeline from the plan's opening schedule:
 * every opening still in the future needs a Manager, brand cutting staff, and
 * an Apprentice.
 */
function buildPipeline(now: Date = new Date()): PlannedOpeningPlan[] {
  const idx = now.getFullYear() * 12 + now.getMonth()
  return OPENING_SCHEDULE.filter(
    (op) => op.year * 12 + (op.month - 1) >= idx,
  ).map((op) => {
    // Tier → cutting role: Mid=Senior Barber, Youth=Junior Barber, Elite=Barber.
    const roleForTier: RoleBucket =
      op.tier === "Mid"
        ? "Senior Barber"
        : op.tier === "Youth"
          ? "Junior Barber"
          : "Barber"
    const roles: PipelineRole[] = [
      { role: "Manager", count: op.manager },
      { role: roleForTier, count: op.barbers },
      { role: "Apprentice", count: op.apprentices },
    ]
    return {
      location: op.location,
      tier: op.tier,
      year: op.year,
      month: op.month,
      cuttingRole: roleForTier,
      roles,
      totalRoles: roles.reduce((a, r) => a + r.count, 0),
    }
  })
}

// Re-export so callers can label brand tiers alongside roles if needed.
export { tierForBrand }
