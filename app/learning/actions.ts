"use server"

import { revalidatePath } from "next/cache"
import { requireLearningManager, getAccessUser, canRatePbc } from "@/lib/access"
import {
  createCourse,
  updateCourse,
  setCourseActive,
  setCourseRoleReq,
  removeCourseRoleReq,
  addRoleGate,
  removeRoleGate,
  savePlanMeta,
  addPlanItem,
  updatePlanItem,
  deletePlanItem,
  openOneToOne,
  saveManagerAnswers,
  completeOneToOne,
  upsertPbcRating,
  getBarberBasics,
  getCurrentOneToOne,
  saveAiPbc,
  readSelfPrep,
} from "@/lib/learning"
import { currentPeriod, type OneToOneAnswers, type CourseRequirement, type PlanItemStatus } from "@/lib/learning-types"
import { sendOneToOneComplete, sendOneToOneReminder } from "@/lib/team-notify"
import { analysePbc } from "@/lib/pbc-ai"
import { threeSixtyReadiness } from "@/lib/three-sixty"

// ---------------------------------------------------------------------------
// L&D manager / training-lead server actions.
// Form-bound actions return void (satisfy <form action>); programmatic ones
// (called via transitions) may return status objects.
// ---------------------------------------------------------------------------

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function str(v: FormDataEntryValue | null): string | null {
  const s = (v as string)?.trim()
  return s ? s : null
}

// --- Catalogue (form-bound) ------------------------------------------------

export async function createCourseAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const title = str(fd.get("title"))
  if (!title) return
  await createCourse({
    title,
    description: str(fd.get("description")),
    provider: str(fd.get("provider")),
    category: str(fd.get("category")),
    delivery: str(fd.get("delivery")),
    durationNote: str(fd.get("durationNote")),
  })
  revalidatePath("/learning/courses")
}

export async function updateCourseAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const id = num(fd.get("id"))
  if (!id) return
  await updateCourse(id, {
    title: str(fd.get("title")) ?? undefined,
    description: str(fd.get("description")),
    provider: str(fd.get("provider")),
    category: str(fd.get("category")),
    delivery: str(fd.get("delivery")),
    durationNote: str(fd.get("durationNote")),
  })
  revalidatePath("/learning/courses")
}

export async function toggleCourseActiveAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const id = num(fd.get("id"))
  if (!id) return
  await setCourseActive(id, fd.get("active") === "true")
  revalidatePath("/learning/courses")
}

export async function setCourseRoleReqAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const courseId = num(fd.get("courseId"))
  const role = str(fd.get("role"))
  const requirement = (str(fd.get("requirement")) ?? "required") as CourseRequirement
  if (!courseId || !role) return
  await setCourseRoleReq(courseId, role, requirement)
  revalidatePath("/learning/courses")
}

export async function removeCourseRoleReqAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const courseId = num(fd.get("courseId"))
  const role = str(fd.get("role"))
  if (!courseId || !role) return
  await removeCourseRoleReq(courseId, role)
  revalidatePath("/learning/courses")
}

export async function addRoleGateAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const role = str(fd.get("role"))
  const requirement = str(fd.get("requirement"))
  if (!role || !requirement) return
  await addRoleGate(role, requirement)
  revalidatePath("/learning/courses")
}

export async function removeRoleGateAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const id = num(fd.get("id"))
  if (!id) return
  await removeRoleGate(id)
  revalidatePath("/learning/courses")
}

// --- Plans (form-bound; lead editing anyone's plan) ------------------------

export async function savePlanMetaAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const barberId = num(fd.get("barberId"))
  if (!barberId) return
  await savePlanMeta(barberId, {
    targetRole: str(fd.get("targetRole")),
    aspiration: str(fd.get("aspiration")),
  })
  revalidatePath(`/learning/plans/${barberId}`)
}

export async function addPlanItemAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const barberId = num(fd.get("barberId"))
  if (!barberId) return
  await addPlanItem(barberId, {
    courseId: num(fd.get("courseId")),
    title: str(fd.get("title")),
    targetDate: str(fd.get("targetDate")),
    notes: str(fd.get("notes")),
  })
  revalidatePath(`/learning/plans/${barberId}`)
}

export async function updatePlanItemAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const itemId = num(fd.get("itemId"))
  const barberId = num(fd.get("barberId"))
  if (!itemId) return
  await updatePlanItem(itemId, {
    status: (str(fd.get("status")) as PlanItemStatus) ?? undefined,
    notes: str(fd.get("notes")),
  })
  if (barberId) revalidatePath(`/learning/plans/${barberId}`)
}

export async function deletePlanItemAction(fd: FormData): Promise<void> {
  await requireLearningManager()
  const itemId = num(fd.get("itemId"))
  const barberId = num(fd.get("barberId"))
  if (!itemId) return
  await deletePlanItem(itemId)
  if (barberId) revalidatePath(`/learning/plans/${barberId}`)
}

// --- 1-2-1 + PBC (programmatic, called via transitions) --------------------

export async function openOneToOneAction(barberId: number): Promise<{ ok: boolean; id?: number }> {
  const user = await getAccessUser()
  if (!user) return { ok: false }
  const basics = await getBarberBasics(barberId)
  if (!basics || !canRatePbc(user, basics.managerUserId)) return { ok: false }
  const row = await openOneToOne(barberId, basics.managerUserId ?? user.id)
  revalidatePath(`/learning/plans/${barberId}`)
  return { ok: true, id: row.id }
}

/**
 * Run the AI PBC analysis for a barber's current 1-2-1 and store the suggestion.
 * Pulls the 360 reviewer feedback (the vital input), the barber's self-prep and
 * any KPI notes, then writes the proposed scores to the 1-2-1 for the manager to
 * review and override. Returns the suggestion for immediate display.
 */
export async function generateAiPbcAction(
  barberId: number,
): Promise<{ ok: boolean; ai?: Record<string, unknown>; error?: string }> {
  const user = await getAccessUser()
  if (!user) return { ok: false, error: "Not signed in." }
  const basics = await getBarberBasics(barberId)
  if (!basics || !canRatePbc(user, basics.managerUserId)) return { ok: false, error: "Not authorised." }

  const oto = await getCurrentOneToOne(barberId)
  if (!oto) return { ok: false, error: "Open the 1-2-1 first." }

  const period = oto.period ?? currentPeriod()
  const readiness = await threeSixtyReadiness(barberId, period)

  try {
    const ai = await analysePbc({
      cycleId: readiness.cycleId,
      barberName: basics.name,
      role: basics.role,
      selfPrep: readSelfPrep(oto),
      kpiNotes: null,
      lowConfidence: readiness.lowConfidence || readiness.cycleId === null,
    })
    await saveAiPbc(oto.id, { ...ai, responded: readiness.responded, threshold: readiness.threshold })
    revalidatePath(`/learning/plans/${barberId}`)
    return { ok: true, ai: { ...ai, responded: readiness.responded, threshold: readiness.threshold } }
  } catch (e) {
    console.log("[v0] analysePbc failed:", (e as Error).message)
    return { ok: false, error: "The AI analysis could not be generated. Please score manually." }
  }
}

export async function saveManagerAnswersAction(
  oneToOneId: number,
  barberId: number,
  answers: OneToOneAnswers,
  differenceReason?: string | null,
): Promise<{ ok: boolean }> {
  const user = await getAccessUser()
  if (!user) return { ok: false }
  const basics = await getBarberBasics(barberId)
  if (!basics || !canRatePbc(user, basics.managerUserId)) return { ok: false }
  await saveManagerAnswers(oneToOneId, { answers, differenceReason: differenceReason ?? null })
  revalidatePath(`/learning/plans/${barberId}`)
  return { ok: true }
}

export async function completeOneToOneAction(input: {
  oneToOneId: number
  barberId: number
  managerAnswers: OneToOneAnswers
  performance: number
  behaviours: number
  contribution: number
  overall: number
  summary?: string | null
  actions?: string | null
  comment?: string | null
  differenceReason?: string | null
}): Promise<{ ok: boolean }> {
  const user = await getAccessUser()
  if (!user) return { ok: false }
  const basics = await getBarberBasics(input.barberId)
  if (!basics || !canRatePbc(user, basics.managerUserId)) return { ok: false }

  await completeOneToOne(input.oneToOneId, {
    managerAnswers: input.managerAnswers,
    performance: input.performance,
    behaviours: input.behaviours,
    contribution: input.contribution,
    overall: input.overall,
    summary: input.summary,
    actions: input.actions,
    comment: input.comment,
    differenceReason: input.differenceReason,
    ratedBy: user.id,
    ratedByName: user.name,
  })

  // Fire the completion email (scores + summary + link). Best-effort.
  try {
    await sendOneToOneComplete({
      barberId: input.barberId,
      performance: input.performance,
      behaviours: input.behaviours,
      contribution: input.contribution,
      overall: input.overall,
      summary: input.summary ?? null,
      actions: input.actions ?? null,
    })
  } catch (e) {
    console.log("[v0] sendOneToOneComplete failed:", (e as Error).message)
  }

  revalidatePath(`/learning/plans/${input.barberId}`)
  revalidatePath("/learning/plans")
  return { ok: true }
}

/** Direct PBC upsert (manager overrides without the full 1-2-1 flow). */
export async function savePbcAction(input: {
  barberId: number
  period?: string
  performance: number
  behaviours: number
  contribution: number
  overall: number
  comment?: string | null
}): Promise<{ ok: boolean }> {
  const user = await getAccessUser()
  if (!user) return { ok: false }
  const basics = await getBarberBasics(input.barberId)
  if (!basics || !canRatePbc(user, basics.managerUserId)) return { ok: false }
  await upsertPbcRating({
    barberId: input.barberId,
    period: input.period ?? currentPeriod(),
    performance: input.performance,
    behaviours: input.behaviours,
    contribution: input.contribution,
    overall: input.overall,
    comment: input.comment ?? null,
    ratedBy: user.id,
    ratedByName: user.name,
  })
  revalidatePath(`/learning/plans/${input.barberId}`)
  return { ok: true }
}

/**
 * Resend the 1-2-1 invite/links for a barber whose 1-2-1 is Scheduled.
 * Emails the manager (their review link) and the barber (their self-prep link),
 * deduped. Only the barber's manager or an L&D manager may trigger it.
 */
export async function resendOneToOneInviteAction(
  barberId: number,
): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const user = await getAccessUser()
  if (!user) return { ok: false, error: "Not signed in" }
  const basics = await getBarberBasics(barberId)
  if (!basics) return { ok: false, error: "Team member not found" }
  if (!canRatePbc(user, basics.managerUserId)) return { ok: false, error: "Not authorised" }

  const current = await getCurrentOneToOne(barberId)
  if (!current || current.status !== "Scheduled") {
    return { ok: false, error: "No scheduled 1-2-1 to resend" }
  }

  const period = current.period ?? currentPeriod()
  const dueOn = current.dueOn ? new Date(current.dueOn).toISOString().slice(0, 10) : null

  try {
    const sent = await sendOneToOneReminder({ barberId, period, dueOn })
    return { ok: true, sent }
  } catch (e) {
    console.log("[v0] resendOneToOneInviteAction failed:", (e as Error).message)
    return { ok: false, error: "Could not send the invite email" }
  }
}
