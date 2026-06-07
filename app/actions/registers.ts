"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  decisions,
  recruitmentCandidates,
  trainingLearners,
  activityLog,
} from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { sweepAutoEscalations } from "@/lib/registers"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user
}

const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Decision Register
// ---------------------------------------------------------------------------

export async function createDecision(formData: FormData) {
  const u = await requireUser()
  const title = String(formData.get("title") ?? "").trim()
  const decision = String(formData.get("decision") ?? "").trim()
  const functionArea = String(formData.get("functionArea") ?? "").trim()
  if (!title || !decision || !functionArea) {
    throw new Error("Title, decision and area are required")
  }
  const context = String(formData.get("context") ?? "").trim() || null
  const rationale = String(formData.get("rationale") ?? "").trim() || null
  const siteId = Number(formData.get("siteId")) || null
  const decidedBy = String(formData.get("decidedBy") ?? "").trim() || u.name
  const reviewDate = String(formData.get("reviewDate") ?? "").trim() || null
  const decidedOn = String(formData.get("decidedOn") ?? "").trim() || today()

  await db.insert(decisions).values({
    title,
    context,
    decision,
    rationale,
    functionArea,
    siteId,
    decidedBy,
    decidedByUserId: u.id,
    createdByUserId: u.id,
    reviewDate,
    decidedOn,
    status: "Active",
  })
  revalidatePath("/decisions")
}

export async function setDecisionStatus(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  const status = String(formData.get("status"))
  if (!id || !["Active", "Superseded", "Reversed"].includes(status)) return
  await db
    .update(decisions)
    .set({ status, updatedAt: new Date() })
    .where(eq(decisions.id, id))
  revalidatePath("/decisions")
}

// ---------------------------------------------------------------------------
// Recruitment funnel
// ---------------------------------------------------------------------------

const RECRUITMENT_STAGE_DATE: Record<string, string> = {
  Interview: "interviewOn",
  Offer: "offerOn",
  Hired: "hiredOn",
}

export async function createCandidate(formData: FormData) {
  await requireUser()
  const name = String(formData.get("name") ?? "").trim()
  if (!name) throw new Error("Name is required")
  const role = String(formData.get("role") ?? "Barber").trim() || "Barber"
  const siteId = Number(formData.get("siteId")) || null
  const source = String(formData.get("source") ?? "").trim() || null
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim() || null
  const notes = String(formData.get("notes") ?? "").trim() || null

  await db.insert(recruitmentCandidates).values({
    name,
    role,
    siteId,
    source,
    ownerUserId,
    notes,
    stage: "Contacted",
    status: "Active",
    contactedOn: today(),
  })
  revalidatePath("/recruitment")
}

export async function setCandidateStage(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  const stage = String(formData.get("stage"))
  if (!id || !["Contacted", "Interview", "Offer", "Hired"].includes(stage)) return

  // Stamp the date the candidate first reached this stage (don't overwrite).
  const dateField = RECRUITMENT_STAGE_DATE[stage]
  const [existing] = await db
    .select()
    .from(recruitmentCandidates)
    .where(eq(recruitmentCandidates.id, id))
  if (!existing) return

  const set: Record<string, unknown> = { stage, updatedAt: new Date() }
  if (dateField && !(existing as Record<string, unknown>)[dateField]) {
    set[dateField] = today()
  }
  await db
    .update(recruitmentCandidates)
    .set(set)
    .where(eq(recruitmentCandidates.id, id))
  revalidatePath("/recruitment")
}

export async function setCandidateStatus(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  const status = String(formData.get("status"))
  if (!id || !["Active", "Rejected", "Withdrawn"].includes(status)) return
  await db
    .update(recruitmentCandidates)
    .set({ status, updatedAt: new Date() })
    .where(eq(recruitmentCandidates.id, id))
  revalidatePath("/recruitment")
}

export async function logCandidateFollowUp(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  if (!id) return
  await db
    .update(recruitmentCandidates)
    .set({
      followUpCount: sql`${recruitmentCandidates.followUpCount} + 1`,
      lastFollowUpOn: today(),
      updatedAt: new Date(),
    })
    .where(eq(recruitmentCandidates.id, id))
  revalidatePath("/recruitment")
}

// ---------------------------------------------------------------------------
// Training funnel
// ---------------------------------------------------------------------------

const TRAINING_STAGE_DATE: Record<string, string> = {
  Enrolled: "enrolledOn",
  Completed: "completedOn",
  Placed: "placedOn",
}

export async function createLearner(formData: FormData) {
  await requireUser()
  const name = String(formData.get("name") ?? "").trim()
  if (!name) throw new Error("Name is required")
  const program = String(formData.get("program") ?? "Academy").trim() || "Academy"
  const siteId = Number(formData.get("siteId")) || null
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim() || null
  const notes = String(formData.get("notes") ?? "").trim() || null

  await db.insert(trainingLearners).values({
    name,
    program,
    siteId,
    ownerUserId,
    notes,
    stage: "Enquiry",
    status: "Active",
    enquiryOn: today(),
  })
  revalidatePath("/training-funnel")
}

export async function setLearnerStage(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  const stage = String(formData.get("stage"))
  if (!id || !["Enquiry", "Enrolled", "Completed", "Placed"].includes(stage)) return

  const dateField = TRAINING_STAGE_DATE[stage]
  const [existing] = await db
    .select()
    .from(trainingLearners)
    .where(eq(trainingLearners.id, id))
  if (!existing) return

  const set: Record<string, unknown> = { stage, updatedAt: new Date() }
  if (dateField && !(existing as Record<string, unknown>)[dateField]) {
    set[dateField] = today()
  }
  await db.update(trainingLearners).set(set).where(eq(trainingLearners.id, id))
  revalidatePath("/training-funnel")
}

export async function setLearnerStatus(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  const status = String(formData.get("status"))
  if (!id || !["Active", "Dropped"].includes(status)) return
  await db
    .update(trainingLearners)
    .set({ status, updatedAt: new Date() })
    .where(eq(trainingLearners.id, id))
  revalidatePath("/training-funnel")
}

// ---------------------------------------------------------------------------
// Behaviour / activity tracking
// ---------------------------------------------------------------------------

export async function logActivity(formData: FormData) {
  await requireUser()
  const functionArea = String(formData.get("functionArea") ?? "").trim()
  const activityType = String(formData.get("activityType") ?? "").trim()
  const weekEnding = String(formData.get("weekEnding") ?? "").trim()
  const count = Number(formData.get("count")) || 0
  if (!functionArea || !activityType || !weekEnding) return
  const siteId = Number(formData.get("siteId")) || null
  const notes = String(formData.get("notes") ?? "").trim() || null

  await db.insert(activityLog).values({
    functionArea,
    activityType,
    siteId,
    weekEnding,
    count,
    notes,
  })
  revalidatePath("/activity")
  revalidatePath("/data-entry")
}

// ---------------------------------------------------------------------------
// Auto-escalation engine
// ---------------------------------------------------------------------------

/**
 * Escalate open actions that are either:
 *  - overdue by 7+ days, or
 *  - red and still open for 2+ weeks (14 days since being raised).
 * Idempotent: only escalates actions not already escalated. Safe to call on
 * every actions/dashboard load. Delegates to the render-safe sweep in
 * lib/registers and handles revalidation here.
 */
export async function runAutoEscalation() {
  const escalated = await sweepAutoEscalations()
  if (escalated > 0) {
    revalidatePath("/actions")
    revalidatePath("/operations")
    revalidatePath("/")
  }
  return escalated
}

/** Manually clear an escalation once it has been actioned. */
export async function clearEscalation(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  if (!id) return
  await db
    .update(actions)
    .set({
      escalated: false,
      autoEscalated: false,
      escalatedAt: null,
      escalationReason: null,
    })
    .where(eq(actions.id, id))
  revalidatePath("/actions")
}
