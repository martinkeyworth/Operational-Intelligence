// Canonical functional areas for the LTZ governance model. Actions, KPIs and
// risks are tagged by functionArea; these definitions drive the functional-area
// reporting pages (overview + per-area detail).

export type FunctionAreaDef = {
  // Stable key used in URLs and matched against actions.functionArea.
  key: string
  label: string
  // Other functionArea values that should roll up into this area.
  aliases: string[]
  description: string
  ownerRole: string
  // lucide-react icon name, resolved in the client component.
  icon: string
}

export const FUNCTION_AREAS: FunctionAreaDef[] = [
  {
    key: "Capacity",
    label: "Capacity & Utilisation",
    aliases: ["Capacity", "Chairs", "Utilisation"],
    description:
      "Chair occupancy across barbershops — keeping every chair filled and reallocating or recruiting where seats sit empty.",
    ownerRole: "Operations",
    icon: "Armchair",
  },
  {
    key: "RTB",
    label: "Revenue To Business",
    aliases: ["RTB", "Revenue To Business"],
    description:
      "Rent returned to the business per barber against the £/barber assumption. Flags sites returning below the expected contribution.",
    ownerRole: "Finance / Operations",
    icon: "Banknote",
  },
  {
    key: "Subletting",
    label: "Subletting",
    aliases: ["Subletting", "Sublet"],
    description:
      "Weekly chair/room rent income per site against target. Below-target weeks raise a quarterly review.",
    ownerRole: "Operations",
    icon: "Building2",
  },
  {
    key: "Training",
    label: "Training & Academy",
    aliases: ["Training", "Academy"],
    description:
      "Academy throughput — private learners and apprentices against weekly capacity across training sites.",
    ownerRole: "Training Lead",
    icon: "GraduationCap",
  },
  {
    key: "HR",
    label: "People & HR",
    aliases: ["HR", "People", "Recruitment"],
    description:
      "Recruitment, retention, onboarding and people compliance across the group.",
    ownerRole: "HR Lead",
    icon: "Users",
  },
  {
    key: "Marketing",
    label: "Marketing & Social",
    aliases: ["Marketing", "Social Media", "Social", "Brand"],
    description:
      "Brand, social media reach and marketing-driven demand generation across all sites.",
    ownerRole: "Social Media",
    icon: "Megaphone",
  },
]

export function findFunctionArea(key: string): FunctionAreaDef | undefined {
  const lower = key.toLowerCase()
  return FUNCTION_AREAS.find(
    (a) =>
      a.key.toLowerCase() === lower ||
      a.aliases.some((al) => al.toLowerCase() === lower),
  )
}

/** Map any raw action.functionArea string onto a canonical area key. */
export function canonicalAreaKey(raw: string): string {
  return findFunctionArea(raw)?.key ?? raw
}
