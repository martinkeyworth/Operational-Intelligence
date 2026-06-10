// Default action ownership matrix for the LTZ leadership team. Every action is
// tagged to a functionArea; this maps each canonical area onto the leader
// accountable for it, so newly created and auto-raised actions get an initial
// owner without manual assignment. Owners are resolved by email (stable across
// environments) and can always be reassigned afterwards in the register.
//
// Ownership model (per leadership remit):
//  - Luke   (HR)        — HR + initial staffing/placement of who goes into each
//                         new shop, aligned to Mario's expansion plan.
//  - Ravi   (Training)  — Learning & development, CPD, Google Classroom, private
//                         training, apprentice progress and growing staff into
//                         new roles.
//  - Mario  (Marketing) — Social media, brand, all shops & barber utilisation,
//                         RTB & target, and identifying/placing brand growth.
//                         Owns Capacity, RTB, Subletting (utilisation) too.
//  - Cosmin (Strategy)  — Governance, property/site-finding for growth, driving
//                         delivery and interlocking actions as a programme plan.
import { canonicalAreaKey } from "@/lib/function-areas"
import { ROLES } from "@/lib/roles"

// Canonical function-area key -> default owner email.
//  - Creative split: Mario owns brand/campaigns/social (Marketing); Ravi owns
//    creative *training* and skill standards (Training).
//  - Finance/P&L, Compliance/Risk and Stock sit with Cosmin via the COO remit.
//  - Customer Experience/retention sits with Mario (brand).
const AREA_OWNER_EMAIL: Record<string, string> = {
  HR: "luke@lessthanzerobarbers.com",
  Training: "ravi@lessthanzerobarbers.com",
  Marketing: "mario@lessthanzerobarbers.com",
  Capacity: "mario@lessthanzerobarbers.com",
  RTB: "mario@lessthanzerobarbers.com",
  Subletting: "mario@lessthanzerobarbers.com",
  CustomerExperience: "mario@lessthanzerobarbers.com",
  Strategy: "cosmin@lessthanzerobarbers.com",
  Finance: "cosmin@lessthanzerobarbers.com",
  Compliance: "cosmin@lessthanzerobarbers.com",
  Stock: "cosmin@lessthanzerobarbers.com",
}

// Governance/programme-level fallback owner when an area has no explicit lead —
// Cosmin drives delivery and interlocks actions as the programme plan.
export const PROGRAMME_OWNER_EMAIL = "cosmin@lessthanzerobarbers.com"

/** Default owner email for a raw or canonical function-area string. */
export function defaultOwnerEmailForArea(functionArea: string): string {
  const key = canonicalAreaKey(functionArea)
  return AREA_OWNER_EMAIL[key] ?? PROGRAMME_OWNER_EMAIL
}

// Build the keyword routing table once from the leadership roles. Each lead's
// routingKeywords map back to their holder email, longest keywords first so
// the most specific match wins.
const KEYWORD_OWNERS: { keyword: string; email: string }[] = ROLES.filter(
  (r) => r.holderEmail && r.routingKeywords?.length,
)
  .flatMap((r) =>
    (r.routingKeywords ?? []).map((keyword) => ({
      keyword: keyword.toLowerCase(),
      email: r.holderEmail as string,
    })),
  )
  .sort((a, b) => b.keyword.length - a.keyword.length)

/**
 * Smart default owner: prefer a keyword match in the action title/description
 * (e.g. "apprentice progress" → Ravi, "new lease" → Cosmin), and fall back to
 * the function-area mapping when nothing matches. Lets routing reflect the
 * responsibility, not just the broad area.
 */
export function defaultOwnerEmailForAction(opts: {
  functionArea: string
  title?: string | null
  description?: string | null
}): string {
  const text = `${opts.title ?? ""} ${opts.description ?? ""}`.toLowerCase()
  if (text.trim()) {
    const hit = KEYWORD_OWNERS.find((k) => text.includes(k.keyword))
    if (hit) return hit.email
  }
  return defaultOwnerEmailForArea(opts.functionArea)
}
