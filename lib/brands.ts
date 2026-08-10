// Central brand registry. Maps each brand name to its logo + accent.
// The group (parent) brand is LTZ Group International; each site belongs to a
// barbershop brand (Less Than Zero, F.AF, LTZ Woodseats) and the academy uses
// the LTZ Training Academy mark. LTZ Woodseats was formerly branded "Velvet
// Ash"; legacy stored values are normalised via BRAND_ALIASES below.

export type Brand = {
  name: string
  logo: string
  // Short tagline shown under the name where appropriate.
  tagline?: string
}

export const GROUP_BRAND: Brand = {
  name: "LTZ Group",
  logo: "/ltz-group-logo.jpeg",
  tagline: "International",
}

export const TRAINING_BRAND: Brand = {
  name: "LTZ Training Academy",
  logo: "/brand-training-academy.jpeg",
  tagline: "Barbering & Grooming Institute",
}

// Barbershop site brands, keyed by the value stored in sites.brand.
export const SITE_BRANDS: Record<string, Brand> = {
  "Less Than Zero": {
    name: "Less Than Zero",
    logo: "/brand-less-than-zero.jpeg",
    tagline: "England",
  },
  "F.AF": {
    name: "F.AF",
    logo: "/brand-faf.jpeg",
    tagline: "Be Loud. Stay Real.",
  },
  "LTZ Woodseats": {
    name: "LTZ Woodseats",
    logo: "/brand-velvet-ash.jpeg",
    tagline: "Ritual · Texture · Craft",
  },
}

/** The list of brand options for pickers. */
export const SITE_BRAND_OPTIONS = Object.keys(SITE_BRANDS)

/**
 * Legacy brand values still stored in sites.brand map to their current name so
 * the app resolves correctly whether or not the DB has been migrated. Run
 * `UPDATE sites SET brand='LTZ Woodseats' WHERE brand='Velvet Ash';` on prod to
 * make the stored value match.
 */
const BRAND_ALIASES: Record<string, string> = {
  "Velvet Ash": "LTZ Woodseats",
}

/** Normalise a stored brand value to its current canonical name. */
export function normalizeBrand(
  brand: string | null | undefined,
): string | null | undefined {
  if (!brand) return brand
  return BRAND_ALIASES[brand] ?? brand
}

/**
 * Legacy site *names* still stored in sites.name (e.g. the row
 * "Velvet Ash Woodseats"). Unlike sites.brand these are free-text names shown
 * verbatim across the app, so we rewrite them on read. This makes the rebrand
 * correct regardless of whether the prod DB has been migrated.
 *
 * Order matters: the most specific full-name match is applied first so
 * "Velvet Ash Woodseats" collapses straight to "LTZ Woodseats" instead of the
 * naive substring result "LTZ Woodseats Woodseats". Run this on prod to make
 * the stored values match:
 *   UPDATE sites SET name = 'LTZ Woodseats', brand = 'LTZ Woodseats'
 *   WHERE name ILIKE '%Velvet Ash%' OR brand = 'Velvet Ash';
 */
const SITE_NAME_ALIASES: Array<[RegExp, string]> = [
  [/Velvet Ash Woodseats/gi, "LTZ Woodseats"],
  [/Velvet Ash/gi, "LTZ Woodseats"],
]

/**
 * Normalise a stored site name for display, rewriting any legacy brand
 * fragments to their current name. Safe to call on any name string.
 */
export function normalizeSiteName<T extends string | null | undefined>(
  name: T,
): T {
  if (!name) return name
  let out = name as string
  for (const [pattern, replacement] of SITE_NAME_ALIASES) {
    out = out.replace(pattern, replacement)
  }
  return out as T
}

/**
 * Resolve a full brand record. Training-academy sites use the LTZ Training
 * Academy mark regardless of their stored brand; barbershops resolve by brand
 * and fall back to the group brand.
 */
export function getBrand(
  brand: string | null | undefined,
  siteType?: string | null,
): Brand {
  if (siteType === "training") return TRAINING_BRAND
  const canonical = normalizeBrand(brand)
  if (!canonical) return GROUP_BRAND
  return SITE_BRANDS[canonical] ?? GROUP_BRAND
}

/** Resolve a site brand's logo, falling back to the group mark. */
export function brandLogo(
  brand: string | null | undefined,
  siteType?: string | null,
): string {
  return getBrand(brand, siteType).logo
}
