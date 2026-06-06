// Subletting (chair/room rent) KPI configuration. Client-safe (no db imports).
import type { Rag } from "@/lib/format"

// The weekly subletting target. Anything below this is RED and triggers a
// quarterly review action. Currently tracked for the Cavendish (F.AF) site.
export const SUBLET_WEEKLY_TARGET = 950

export const SUBLET_KPI = {
  name: "Subletting Income",
  unit: "£ / week",
  target: SUBLET_WEEKLY_TARGET,
  frequency: "Weekly" as const,
  reviewCadence: "Quarterly" as const,
  // Site this KPI is currently tracked for.
  siteName: "Cavendish",
}

/** RAG for a weekly subletting amount against its target.
 *  Per policy: at/above target is green, anything below target is red. */
export function ragForSublet(amount: number, target = SUBLET_WEEKLY_TARGET): Rag {
  return amount >= target ? "green" : "red"
}
