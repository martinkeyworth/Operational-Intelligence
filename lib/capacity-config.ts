// Client-safe capacity & RTB KPI helpers. No server/database imports.
import type { Rag } from "@/lib/format"

/** Default weekly Revenue-To-Business assumption per barber (£). */
export const RTB_PER_BARBER = 500

/**
 * Chair utilisation RAG (total headcount / total chair capacity).
 * Green at/above capacity (>= 100%), amber within 10% under (90% - 99%),
 * red anything more than 10% below capacity (< 90%).
 */
export function ragForUtilisation(activeBarbers: number, capacity: number): Rag {
  if (capacity <= 0) return "green"
  const pct = (activeBarbers / capacity) * 100
  if (pct >= 100) return "green"
  if (pct >= 90) return "amber"
  return "red"
}

/**
 * Revenue-To-Business RAG. Expected weekly RTB = barbers x £500.
 * At/above expected is green, anything below is red.
 */
export function ragForRtb(actual: number, expected: number): Rag {
  if (expected <= 0) return "green"
  return actual >= expected ? "green" : "red"
}

/** Training throughput RAG. Below either weekly capacity target is red. */
export function ragForTraining(
  learners: number,
  learnerCapacity: number,
  apprentices: number,
  apprenticeCapacity: number,
): Rag {
  const learnerOk = learnerCapacity <= 0 || learners >= learnerCapacity
  const apprenticeOk = apprenticeCapacity <= 0 || apprentices >= apprenticeCapacity
  return learnerOk && apprenticeOk ? "green" : "red"
}
