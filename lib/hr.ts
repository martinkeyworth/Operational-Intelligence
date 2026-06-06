import "server-only"
import { db } from "@/lib/db"
import { sites, barbers } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { tierForBrand } from "@/lib/plan"

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

// Academy staffing ratios against the live apprentice headcount.
export const APPRENTICES_PER_TRAINER = 6
export const APPRENTICES_PER_ASSESSOR = 10

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

export type RecruitmentPlan = {
  sites: SiteRolePlan[]
  // Group totals by role across all shops + academy.
  byRole: { role: RoleBucket; have: number; need: number; gap: number }[]
  totalGap: number
  apprenticesHave: number
  apprenticesNeed: number
  trainersNeed: number
  assessorsNeed: number
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
  // Scale academy staff against the larger of current vs target apprentices so
  // we recruit trainers ahead of the apprentice intake.
  const apprenticeBasis = Math.max(apprenticesHave, apprenticesNeed)
  const trainersNeed = Math.ceil(apprenticeBasis / APPRENTICES_PER_TRAINER)
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

  const byRole = ROLE_LADDER.filter((role) => roleAgg.has(role)).map((role) => {
    const { have, need } = roleAgg.get(role)!
    return { role, have, need, gap: Math.max(0, need - have) }
  })

  const totalGap = byRole.reduce((a, r) => a + r.gap, 0)

  return {
    sites: sitePlans,
    byRole,
    totalGap,
    apprenticesHave,
    apprenticesNeed,
    trainersNeed,
    assessorsNeed,
  }
}

// Re-export so callers can label brand tiers alongside roles if needed.
export { tierForBrand }
