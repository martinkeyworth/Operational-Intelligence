// Training revenue configuration. Client-safe (no db imports).
import type { Rag } from "@/lib/format"

// Each private learner generates £92 per week. The weekly target ("capacity")
// is the site's learnerCapacity x £92. Apprentices do not carry £92 revenue.
export const TRAINING_RATE_PER_LEARNER = 92

/** Weekly training revenue for a given number of private learners. */
export function trainingRevenue(privateLearners: number): number {
  return privateLearners * TRAINING_RATE_PER_LEARNER
}

/** Weekly training revenue target from a site's learner capacity. */
export function trainingRevenueTarget(learnerCapacity: number): number {
  return learnerCapacity * TRAINING_RATE_PER_LEARNER
}

/** RAG for training revenue: at/above target green, below red. */
export function ragForTrainingRevenue(actual: number, target: number): Rag {
  if (target <= 0) return "green"
  return actual >= target ? "green" : "red"
}
