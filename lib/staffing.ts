// Role-aware HR staffing model.
//
// The recruitment plan separates every shop's headcount into three buckets —
// MANAGER, CUTTER (brand-labelled), and APPRENTICE — and compares the actual
// staff against a per-shop target derived from the plan:
//   - 1 manager per shop
//   - cutters sized to the shop's chair requirement (chairs minus the manager,
//     who also takes a chair)
//   - 1 apprentice per shop (a success criterion for every site)
//
// Cutter role labels are brand-specific (e.g. LTZ = "Senior Barber",
// Velvet Ash = "Barber", F.AF = "Junior Barber").

import { OPENING_SCHEDULE, type PlannedOpening } from "@/lib/plan"

export type StaffRole = "manager" | "cutter" | "apprentice"

export type RoleCounts = {
  manager: number
  cutter: number
  apprentice: number
}

/** Brand → cutting-role label. Matched case-insensitively against sites.brand. */
const CUTTER_LABEL_BY_BRAND: Record<string, string> = {
  "less than zero": "Senior Barber",
  ltz: "Senior Barber",
  "velvet ash": "Barber",
  "f.af": "Junior Barber",
  faf: "Junior Barber",
}

export function cutterLabelForBrand(brand: string | null | undefined): string {
  if (!brand) return "Barber"
  return CUTTER_LABEL_BY_BRAND[brand.trim().toLowerCase()] ?? "Barber"
}

/** Human label for a role bucket, brand-aware for the cutter tier. */
export function roleLabel(role: StaffRole, brand?: string | null): string {
  if (role === "manager") return "Manager"
  if (role === "apprentice") return "Apprentice"
  return cutterLabelForBrand(brand)
}

/**
 * Bucket a free-text barber role string into one of the three staffing roles.
 * Anything that isn't a manager or apprentice is treated as a cutter (covers
 * "Barber", "Senior Barber", "Master Barber", "Junior Barber", etc.).
 */
export function classifyRole(role: string | null | undefined): StaffRole {
  const r = (role ?? "").toLowerCase()
  if (r.includes("manager")) return "manager"
  if (r.includes("apprentice")) return "apprentice"
  return "cutter"
}

/**
 * Per-shop role target. The manager occupies one chair and cuts, so cutters
 * fill the remaining chairs; every shop also needs one apprentice.
 */
export function staffingTarget(chairCapacity: number): RoleCounts {
  const cutter = Math.max(0, chairCapacity - 1)
  return { manager: 1, cutter, apprentice: 1 }
}

export type SiteStaffing = {
  siteId: number
  name: string
  brand: string
  cutterLabel: string
  chairCapacity: number
  /** Whether per-barber role rows exist; false means we fell back to headcount. */
  roleDataRecorded: boolean
  actual: RoleCounts
  target: RoleCounts
  gap: RoleCounts // positive = roles still to recruit
  totalGap: number
}

export type StaffingPlanInput = {
  siteId: number
  name: string
  brand: string
  chairCapacity: number
  headcount: number
  roleDataRecorded: boolean
  actual: RoleCounts
}

function diff(target: RoleCounts, actual: RoleCounts): RoleCounts {
  return {
    manager: Math.max(0, target.manager - actual.manager),
    cutter: Math.max(0, target.cutter - actual.cutter),
    apprentice: Math.max(0, target.apprentice - actual.apprentice),
  }
}

export function buildSiteStaffing(input: StaffingPlanInput): SiteStaffing {
  const target = staffingTarget(input.chairCapacity)
  const gap = diff(target, input.actual)
  return {
    siteId: input.siteId,
    name: input.name,
    brand: input.brand,
    cutterLabel: cutterLabelForBrand(input.brand),
    chairCapacity: input.chairCapacity,
    roleDataRecorded: input.roleDataRecorded,
    actual: input.actual,
    target,
    gap,
    totalGap: gap.manager + gap.cutter + gap.apprentice,
  }
}

export type PipelineOpening = PlannedOpening & {
  /** Roles to hire for this opening (manager + cutters + apprentices). */
  need: RoleCounts
  cutterLabel: string
  monthLabel: string
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * Upcoming planned openings within `horizonMonths` of `now`, with the roles
 * each new shop needs so HR can recruit ahead of the launch.
 */
export function upcomingPipeline(
  now: Date = new Date(),
  horizonMonths = 12,
): PipelineOpening[] {
  const startIdx = now.getFullYear() * 12 + now.getMonth()
  const endIdx = startIdx + horizonMonths
  return OPENING_SCHEDULE.filter((o) => {
    const idx = o.year * 12 + (o.month - 1)
    return idx >= startIdx && idx <= endIdx
  }).map((o) => ({
    ...o,
    cutterLabel: cutterLabelForBrand(o.tier === "Mid" ? "ltz" : o.tier === "Elite" ? "velvet ash" : "f.af"),
    monthLabel: `${MONTH_NAMES[o.month - 1]} ${o.year}`,
    need: { manager: o.manager, cutter: o.barbers, apprentice: o.apprentices },
  }))
}

export type StaffingPlan = {
  sites: SiteStaffing[]
  totals: {
    actual: RoleCounts
    target: RoleCounts
    gap: RoleCounts
    totalGap: number
    /** Sites missing their required apprentice. */
    apprenticeGapSites: string[]
  }
  pipeline: PipelineOpening[]
}

export function buildStaffingPlan(
  inputs: StaffingPlanInput[],
  now: Date = new Date(),
): StaffingPlan {
  const siteStaffing = inputs.map(buildSiteStaffing)
  const zero = (): RoleCounts => ({ manager: 0, cutter: 0, apprentice: 0 })
  const add = (a: RoleCounts, b: RoleCounts): RoleCounts => ({
    manager: a.manager + b.manager,
    cutter: a.cutter + b.cutter,
    apprentice: a.apprentice + b.apprentice,
  })
  const actual = siteStaffing.reduce((acc, s) => add(acc, s.actual), zero())
  const target = siteStaffing.reduce((acc, s) => add(acc, s.target), zero())
  const gap = siteStaffing.reduce((acc, s) => add(acc, s.gap), zero())
  return {
    sites: siteStaffing,
    totals: {
      actual,
      target,
      gap,
      totalGap: gap.manager + gap.cutter + gap.apprentice,
      apprenticeGapSites: siteStaffing
        .filter((s) => s.gap.apprentice > 0)
        .map((s) => s.name),
    },
    pipeline: upcomingPipeline(now),
  }
}
