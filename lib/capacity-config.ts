// Client-safe capacity & RTB KPI helpers. No server/database imports.
import type { Rag } from "@/lib/format"

/** Default weekly Revenue-To-Business assumption per barber (£). */
export const RTB_PER_BARBER = 500

/**
 * Chair utilisation RAG.
 * Full capacity is green; below capacity is underutilised and treated as red.
 * (No barbers at all is also red.)
 */
export function ragForUtilisation(activeBarbers: number, capacity: number): Rag {
  if (capacity <= 0) return "green"
  if (activeBarbers >= capacity) return "green"
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
