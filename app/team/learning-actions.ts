"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/access"
import { getBarberForUser } from "@/lib/team"
import {
  savePlanMeta,
  addPlanItem,
  updatePlanItem,
  deletePlanItem,
  getCurrentOneToOne,
  saveSelfPrep,
} from "@/lib/learning"
import type { OneToOneAnswers, PlanItemStatus } from "@/lib/learning-types"

// ---------------------------------------------------------------------------
// Barber self-service L&D actions — a barber edits only their OWN plan and
// their own 1-2-1 self-prep (self-scores + reasons). Called via transitions,
// so these return status objects.
// ---------------------------------------------------------------------------

async function ownBarberId(): Promise<number | null> {
  const user = await requireUser()
  const barber = await getBarberForUser(user.id)
  return barber?.id ?? null
}

export async function saveMyPlanMeta(input: {
  targetRole?: string | null
  aspiration?: string | null
}): Promise<{ ok: boolean }> {
  const barberId = await ownBarberId()
  if (!barberId) return { ok: false }
  await savePlanMeta(barberId, input)
  revalidatePath("/team")
  return { ok: true }
}

export async function addMyPlanItem(input: {
  courseId?: number | null
  title?: string | null
  targetDate?: string | null
  notes?: string | null
}): Promise<{ ok: boolean }> {
  const barberId = await ownBarberId()
  if (!barberId) return { ok: false }
  await addPlanItem(barberId, input)
  revalidatePath("/team")
  return { ok: true }
}

export async function updateMyPlanItem(input: {
  itemId: number
  status?: PlanItemStatus
  notes?: string | null
}): Promise<{ ok: boolean }> {
  const barberId = await ownBarberId()
  if (!barberId) return { ok: false }
  await updatePlanItem(input.itemId, { status: input.status, notes: input.notes })
  revalidatePath("/team")
  return { ok: true }
}

export async function deleteMyPlanItem(itemId: number): Promise<{ ok: boolean }> {
  const barberId = await ownBarberId()
  if (!barberId) return { ok: false }
  await deletePlanItem(itemId)
  revalidatePath("/team")
  return { ok: true }
}

/** Save the barber's own 1-2-1 self-prep answers + PBC self-scores/reason
 *  (only while the current period's 1-2-1 is still a draft). */
export async function saveMySelfPrep(input: {
  answers: OneToOneAnswers
  selfPerformance?: number | null
  selfBehaviours?: number | null
  selfContribution?: number | null
  selfReason?: string | null
}): Promise<{ ok: boolean }> {
  const barberId = await ownBarberId()
  if (!barberId) return { ok: false }
  const oto = await getCurrentOneToOne(barberId)
  if (!oto || oto.status === "Completed") return { ok: false }
  await saveSelfPrep(oto.id, {
    answers: input.answers,
    selfPerformance: input.selfPerformance ?? null,
    selfBehaviours: input.selfBehaviours ?? null,
    selfContribution: input.selfContribution ?? null,
    selfReason: input.selfReason ?? null,
  })
  revalidatePath("/team")
  return { ok: true }
}
