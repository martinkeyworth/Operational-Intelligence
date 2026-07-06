// ---------------------------------------------------------------------------
// KPI catalogue + scoring — every functional area defines weekly KPIs that are
// scored RAG against thresholds, rolled up to a per-area RAG (weighted), then
// to a single overall business RAG (weighted across areas).
//
// Marketing & Social is tracked PER SITE, PER PLATFORM: each site reports how
// many posts went out on each of its platforms that week plus its Google and
// booking-platform ratings. Site managers enter their own site's figures; the
// social-media lead (Mario) reviews and confirms the whole week.
// ---------------------------------------------------------------------------

import type { Rag } from "@/lib/format"

export type KpiDirection = "higher_better" | "lower_better"

export type KpiDef = {
  // Stable code stored in kpis.code and used to match kpi_values.
  code: string
  name: string
  functionArea: string
  unit: string
  // green: at/over (higher_better) or at/under (lower_better) this value.
  // amber: between green and amber threshold. Beyond amber = red.
  green: number
  amber: number
  direction: KpiDirection
  // When true the KPI has NO amber band — it is either green (target met) or
  // red. Used for the social-posting cadence targets (hit the daily minimum
  // for the week or it's red).
  noAmber?: boolean
  ownerRole: string
  // Named accountable owner for this KPI (the single person on the hook).
  owner?: string
  // Relative weight of this KPI within its functional area.
  weight: number
  help: string
  // Social platform this KPI relates to (posts + ratings), for grouping in UI.
  platform?: string
}

// ---------------------------------------------------------------------------
// Social platforms
// ---------------------------------------------------------------------------

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  google: "Google",
  linkedin: "LinkedIn",
  booksy: "Booksy",
  fresha: "Fresha",
}

export function platformLabel(code: string): string {
  return PLATFORM_LABELS[code] ?? code
}

// Weekly posting targets, expressed as (per-day minimum × 7 days).
export const SHOP_POSTS_PER_DAY = 3
export const FUNCTION_POSTS_PER_DAY = 1
export const SHOP_WEEKLY_POST_TARGET = SHOP_POSTS_PER_DAY * 7 // 21
export const FUNCTION_WEEKLY_POST_TARGET = FUNCTION_POSTS_PER_DAY * 7 // 7

// Free haircuts at the Training Academy: 3 per week per learner
// (apprentice + private).
export const FREE_HAIRCUTS_PER_LEARNER = 3
export function freeHaircutTarget(learners: number): number {
  return Math.max(0, Math.round(learners)) * FREE_HAIRCUTS_PER_LEARNER
}

// Each barbershop brand posts on a specific set of platforms and takes bookings
// on a specific booking platform. Velvet Ash mirrors Less Than Zero (it is
// being rebranded to LTZ). Resolve by the value stored in sites.brand.
export type SocialProfile = { posts: string[]; booking: string }

export const SOCIAL_PROFILE_BY_BRAND: Record<string, SocialProfile> = {
  "Less Than Zero": {
    posts: ["instagram", "google", "facebook", "booksy"],
    booking: "Booksy",
  },
  "Velvet Ash": {
    posts: ["instagram", "google", "facebook", "booksy"],
    booking: "Booksy",
  },
  "F.AF": {
    posts: ["instagram", "tiktok", "google", "fresha"],
    booking: "Fresha",
  },
}

/** The social profile for a barbershop brand (falls back to the LTZ set). */
export function socialProfileForBrand(
  brand: string | null | undefined,
): SocialProfile {
  const match = brand ? SOCIAL_PROFILE_BY_BRAND[brand] : undefined
  return match ?? SOCIAL_PROFILE_BY_BRAND["Less Than Zero"]
}

// The 5 platforms HR and Training each post on daily (1/day = green, no amber).
export const FUNCTION_POST_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "google",
  "linkedin",
]

// ---------------------------------------------------------------------------
// Static KPI catalogue
// ---------------------------------------------------------------------------

function shopPostDef(platform: string): KpiDef {
  return {
    code: `mkt_posts_${platform}`,
    name: `${platformLabel(platform)} posts`,
    functionArea: "Marketing",
    unit: "posts",
    green: SHOP_WEEKLY_POST_TARGET,
    amber: SHOP_WEEKLY_POST_TARGET,
    direction: "higher_better",
    noAmber: true,
    ownerRole: "Social Media",
    owner: "Mario (Head of Brands)",
    weight: 1,
    platform,
    help: `Posts published on ${platformLabel(platform)} this week. Target ${SHOP_POSTS_PER_DAY}/day (${SHOP_WEEKLY_POST_TARGET}/week) to be green — anything below is red.`,
  }
}

function functionPostDef(area: "HR" | "Training", platform: string): KpiDef {
  return {
    code: `${area === "HR" ? "hr" : "trn"}_posts_${platform}`,
    name: `${platformLabel(platform)} posts`,
    functionArea: area,
    unit: "posts",
    green: FUNCTION_WEEKLY_POST_TARGET,
    amber: FUNCTION_WEEKLY_POST_TARGET,
    direction: "higher_better",
    noAmber: true,
    ownerRole: area === "HR" ? "HR Lead" : "Training Lead",
    owner: area === "HR" ? "Luke (HR Director)" : "Ravi (Training Lead)",
    weight: 1,
    platform,
    help: `Posts published on ${platformLabel(platform)} this week. Target ${FUNCTION_POSTS_PER_DAY}/day (${FUNCTION_WEEKLY_POST_TARGET}/week) to be green — anything below is red.`,
  }
}

export const KPI_CATALOGUE: KpiDef[] = [
  // ---- People & HR --------------------------------------------------------
  {
    code: "hr_vacancies",
    name: "Open vacancies (chairs to fill)",
    functionArea: "HR",
    unit: "roles",
    green: 1,
    amber: 3,
    direction: "lower_better",
    ownerRole: "HR Lead",
    owner: "Luke (HR Director)",
    weight: 1,
    help: "Unfilled chairs/roles across the group. Empty chairs directly cost capacity.",
  },
  {
    code: "hr_leavers",
    name: "Leavers this week",
    functionArea: "HR",
    unit: "people",
    green: 0,
    amber: 1,
    direction: "lower_better",
    ownerRole: "HR Lead",
    owner: "Luke (HR Director)",
    weight: 1,
    help: "Staff turnover this week. Repeated leavers signal a retention problem.",
  },
  {
    code: "hr_compliance",
    name: "Compliance items outstanding",
    functionArea: "HR",
    unit: "items",
    green: 0,
    amber: 2,
    direction: "lower_better",
    ownerRole: "HR Lead",
    owner: "Luke (HR Director)",
    weight: 1.5,
    help: "Right-to-work, contracts and certifications overdue. Compliance is weighted heavily.",
  },
  // HR daily social posting (1/day per platform, no amber).
  ...FUNCTION_POST_PLATFORMS.map((p) => functionPostDef("HR", p)),

  // ---- Marketing & Social (per site, per platform) ------------------------
  // Post KPIs — one per platform used across the barbershop brands. Which
  // platforms apply to a given site is resolved from its brand.
  shopPostDef("instagram"),
  shopPostDef("facebook"),
  shopPostDef("tiktok"),
  shopPostDef("google"),
  shopPostDef("booksy"),
  shopPostDef("fresha"),
  {
    code: "mkt_google_rating",
    name: "Google rating (avg)",
    functionArea: "Marketing",
    unit: "★",
    green: 4.8,
    amber: 4.5,
    direction: "higher_better",
    ownerRole: "Social Media",
    owner: "Mario (Head of Brands)",
    weight: 1.5,
    help: "Average Google review rating for the site. Green ≥ 4.8 · amber 4.5–4.79 · red below 4.5.",
  },
  {
    code: "mkt_booking_rating",
    name: "Booking platform rating (avg)",
    functionArea: "Marketing",
    unit: "★",
    green: 4.9,
    amber: 4.7,
    direction: "higher_better",
    ownerRole: "Social Media",
    owner: "Mario (Head of Brands)",
    weight: 1.5,
    help: "Average Booksy/Fresha rating for the site. Green ≥ 4.9 · amber 4.7–4.89 · red below 4.7.",
  },

  // ---- Training & Academy (social + free haircuts) ------------------------
  ...FUNCTION_POST_PLATFORMS.map((p) => functionPostDef("Training", p)),
  {
    code: "trn_free_haircuts",
    name: "Free haircuts given",
    functionArea: "Training",
    unit: "cuts",
    // Dynamic target: 3 per learner per week (apprentice + private). The green
    // threshold is computed per week from the confirmed learner count; this
    // static value is only a fallback when learners are unknown.
    green: FREE_HAIRCUTS_PER_LEARNER,
    amber: FREE_HAIRCUTS_PER_LEARNER,
    direction: "higher_better",
    noAmber: true,
    ownerRole: "Training Lead",
    owner: "Ravi (Training Lead)",
    weight: 1,
    help: `Complimentary training cuts given this week. Target ${FREE_HAIRCUTS_PER_LEARNER} per learner (apprentice + private) to be green.`,
  },
]

// Functional areas whose Marketing KPIs are scored PER SITE (one cell per
// applicable platform/rating per barbershop site).
export const PER_SITE_AREAS = ["Marketing"]

export function isPerSiteArea(areaKey: string): boolean {
  return PER_SITE_AREAS.includes(areaKey)
}

export function kpisForArea(areaKey: string): KpiDef[] {
  return KPI_CATALOGUE.filter((k) => k.functionArea === areaKey)
}

// A minimal shape describing a site for Marketing KPI resolution.
export type MarketingSiteLike = {
  brand: string | null
  siteType: string | null
}

/**
 * Marketing is tracked per BARBERSHOP site. The Training Academy tracks its own
 * social posts + free haircuts under the Training area, and HR under HR — so
 * they are not part of the per-site Marketing grid.
 */
export function isMarketingSite(site: MarketingSiteLike): boolean {
  return (site.siteType ?? "barbershop") === "barbershop"
}

/**
 * The Marketing KPI defs that apply to a barbershop site, resolved from its
 * brand: one post KPI per platform the brand uses, plus the Google and booking
 * ratings. Any post platform not used by the brand is simply omitted. The
 * `learners` argument is accepted for signature symmetry with other areas but
 * is unused for barbershops.
 */
export function marketingKpisForSite(
  site: MarketingSiteLike,
  _learners?: number,
): KpiDef[] {
  const profile = socialProfileForBrand(site.brand)
  const postDefs = profile.posts
    .map((p) => KPI_CATALOGUE.find((d) => d.code === `mkt_posts_${p}`))
    .filter(Boolean) as KpiDef[]
  const ratings = KPI_CATALOGUE.filter(
    (d) => d.code === "mkt_google_rating" || d.code === "mkt_booking_rating",
  )
  return [...postDefs, ...ratings]
}

export function findKpi(code: string): KpiDef | undefined {
  return KPI_CATALOGUE.find((k) => k.code === code)
}

/** Effective def for scoring — applies the dynamic free-haircut target when a
 *  learner count is supplied. */
export function effectiveKpiDef(def: KpiDef, learners?: number): KpiDef {
  if (def.code === "trn_free_haircuts" && learners != null) {
    const target = freeHaircutTarget(learners)
    return { ...def, green: target, amber: target }
  }
  return def
}

/** Score a single KPI value against its thresholds. */
export function scoreKpi(def: KpiDef, value: number): Rag {
  if (def.direction === "higher_better") {
    if (value >= def.green) return "green"
    if (!def.noAmber && value >= def.amber) return "amber"
    return "red"
  }
  // lower_better
  if (value <= def.green) return "green"
  if (!def.noAmber && value <= def.amber) return "amber"
  return "red"
}

// ---------------------------------------------------------------------------
// Weighted RAG roll-up (industry "weighted score band" logic).
//   green = 2, amber = 1, red = 0. Weighted average mapped to a band:
//     >= 1.7  -> green   (≈ 85%+)
//     >= 1.2  -> amber   (≈ 60–85%)
//     <  1.2  -> red
// ---------------------------------------------------------------------------

export const RAG_POINTS: Record<Rag, number> = { green: 2, amber: 1, red: 0 }

export type WeightedRag = { item: Rag; weight: number }

export function rollUpWeighted(items: WeightedRag[]): {
  rag: Rag
  score: number
  pct: number
} {
  const totalWeight = items.reduce((a, i) => a + i.weight, 0)
  if (totalWeight === 0) return { rag: "green", score: 2, pct: 100 }
  const weighted =
    items.reduce((a, i) => a + RAG_POINTS[i.item] * i.weight, 0) / totalWeight
  const pct = Math.round((weighted / 2) * 100)
  const rag: Rag = weighted >= 1.7 ? "green" : weighted >= 1.2 ? "amber" : "red"
  return { rag, score: Number(weighted.toFixed(2)), pct }
}

// Relative weight of each functional area in the overall business RAG. Revenue-
// driving areas carry more weight than supporting functions.
export const AREA_WEIGHTS: Record<string, number> = {
  Capacity: 1.5,
  RTB: 1.5,
  Subletting: 1,
  Training: 1,
  HR: 1.25,
  Marketing: 0.75,
  // Director-level expansion strategy. Weighted modestly so a backlog of
  // strategic actions nudges, but doesn't dominate, the operational RAG.
  Strategy: 0.75,
}
