"use server"

import { revalidatePath } from "next/cache"
import { requireDashboard, requireAdmin } from "@/lib/access"
import {
  updateAssumptionValue,
  updateSalary,
  updateMilestoneStatus,
  type MilestoneStatus,
} from "@/lib/roadmap"

const VALID_STATUS: MilestoneStatus[] = ["Planned", "In progress", "Done", "At risk"]

/** Edit a financial assumption. Admin-gated (finance figures). */
export async function saveAssumption(formData: FormData) {
  await requireAdmin()
  const key = String(formData.get("key") ?? "").trim()
  const value = Number(formData.get("value"))
  if (!key || !Number.isFinite(value)) throw new Error("Invalid assumption")
  await updateAssumptionValue(key, value)
  revalidatePath("/roadmap")
  revalidatePath("/")
}

/** Edit a leadership salary line and its start year. Admin-gated. */
export async function saveSalary(formData: FormData) {
  await requireAdmin()
  const id = Number(formData.get("id"))
  const annualSalary = Number(formData.get("annualSalary"))
  const startYear = Number(formData.get("startYear"))
  if (!id || !Number.isFinite(annualSalary) || !Number.isFinite(startYear)) {
    throw new Error("Invalid salary")
  }
  await updateSalary(id, annualSalary, startYear)
  revalidatePath("/roadmap")
}

/** Update a milestone's delivery status. Any dashboard (leadership) user. */
export async function saveMilestoneStatus(formData: FormData) {
  await requireDashboard()
  const id = Number(formData.get("id"))
  const status = String(formData.get("status")) as MilestoneStatus
  if (!id || !VALID_STATUS.includes(status)) throw new Error("Invalid status")
  await updateMilestoneStatus(id, status)
  revalidatePath("/roadmap")
  revalidatePath("/")
}
