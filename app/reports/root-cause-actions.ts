"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { actions } from "@/lib/db/schema"
import { requireDashboard } from "@/lib/access"
import {
  runRootCauseAnalysis,
  type RootCauseAnalysis,
} from "@/lib/reporting"

// Root-cause analysis + recommended-action creation belong to the weekly
// reports (dashboard-only). Gate at dashboard level.
async function requireUser() {
  return requireDashboard()
}

/** Generate the AI root-cause analysis + recommended actions for a week. */
export async function generateRootCause(
  weekEnding: string,
): Promise<RootCauseAnalysis> {
  await requireUser()
  return runRootCauseAnalysis(weekEnding)
}

/**
 * Push a single AI-recommended action into the action register as a new,
 * open Action. Returns the created action id.
 */
export async function addRecommendedAction(formData: FormData) {
  await requireUser()
  const title = String(formData.get("title") ?? "").trim()
  const functionArea = String(formData.get("functionArea") ?? "").trim()
  const rationale = String(formData.get("rationale") ?? "").trim() || null
  const priority = String(formData.get("priority") ?? "Medium").trim()
  const owner = String(formData.get("owner") ?? "").trim() || "Unassigned"
  if (!title || !functionArea) throw new Error("Missing title or area")

  // Due in 14 days by default, matching the fortnightly leadership cadence.
  const due = new Date()
  due.setDate(due.getDate() + 14)

  await db.insert(actions).values({
    title,
    description: rationale,
    functionArea,
    entryType: "Action",
    owner,
    priority: ["High", "Medium", "Low"].includes(priority) ? priority : "Medium",
    status: "Open",
    rag: priority === "High" ? "red" : priority === "Low" ? "green" : "amber",
    dueDate: due.toISOString().slice(0, 10),
  })

  revalidatePath("/")
}
