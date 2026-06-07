import "server-only"
import { db } from "@/lib/db"
import {
  decisions,
  recruitmentCandidates,
  trainingLearners,
  activityLog,
  sites,
  user as userTable,
} from "@/lib/db/schema"
import { desc } from "drizzle-orm"

export type SiteOption = { id: number; name: string }
export async function getSiteOptions(): Promise<SiteOption[]> {
  const rows = await db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .orderBy(sites.name)
  return rows
}

// ---------------------------------------------------------------------------
// Decision Register — completes RAID (the "D"). What was decided, by whom,
// when and why.
// ---------------------------------------------------------------------------

export type DecisionRow = {
  id: number
  title: string
  context: string | null
  decision: string
  rationale: string | null
  functionArea: string
  siteName: string | null
  decidedBy: string
  status: string
  reviewDate: string | null
  decidedOn: string
}

export async function getDecisions(): Promise<DecisionRow[]> {
  const siteRows = await db.select({ id: sites.id, name: sites.name }).from(sites)
  const rows = await db.select().from(decisions).orderBy(desc(decisions.decidedOn))
  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    context: d.context,
    decision: d.decision,
    rationale: d.rationale,
    functionArea: d.functionArea,
    siteName: d.siteId ? (siteRows.find((s) => s.id === d.siteId)?.name ?? null) : null,
    decidedBy: d.decidedBy,
    status: d.status,
    reviewDate: d.reviewDate ? String(d.reviewDate) : null,
    decidedOn: String(d.decidedOn),
  }))
}

// ---------------------------------------------------------------------------
// Recruitment funnel — Contacted -> Interview -> Offer -> Hired.
// ---------------------------------------------------------------------------

export const RECRUITMENT_STAGES = [
  "Contacted",
  "Interview",
  "Offer",
  "Hired",
] as const
export type RecruitmentStage = (typeof RECRUITMENT_STAGES)[number]

export type RecruitmentCandidateRow = {
  id: number
  name: string
  role: string
  siteName: string | null
  source: string | null
  stage: string
  status: string
  ownerName: string | null
  contactedOn: string
  interviewOn: string | null
  offerOn: string | null
  hiredOn: string | null
  lastFollowUpOn: string | null
  followUpCount: number
  notes: string | null
}

export type FunnelStageStat = {
  stage: string
  count: number
  // Conversion from the previous stage (%) — null for the first stage.
  convFromPrev: number | null
}

export type RecruitmentFunnel = {
  candidates: RecruitmentCandidateRow[]
  active: number
  hired: number
  rejected: number
  totalFollowUps: number
  // Stage funnel counts each candidate at the furthest stage they reached.
  stages: FunnelStageStat[]
  // End-to-end conversion: hired / total contacted (%).
  overallConversion: number
}

function reachedStageIndex(stage: string, stages: readonly string[]): number {
  const i = stages.indexOf(stage)
  return i < 0 ? 0 : i
}

export async function getRecruitmentFunnel(): Promise<RecruitmentFunnel> {
  const siteRows = await db.select({ id: sites.id, name: sites.name }).from(sites)
  const userRows = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
  const rows = await db
    .select()
    .from(recruitmentCandidates)
    .orderBy(desc(recruitmentCandidates.contactedOn))

  const candidates: RecruitmentCandidateRow[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    siteName: c.siteId ? (siteRows.find((s) => s.id === c.siteId)?.name ?? null) : null,
    source: c.source,
    stage: c.stage,
    status: c.status,
    ownerName: c.ownerUserId
      ? (userRows.find((u) => u.id === c.ownerUserId)?.name ?? null)
      : null,
    contactedOn: String(c.contactedOn),
    interviewOn: c.interviewOn ? String(c.interviewOn) : null,
    offerOn: c.offerOn ? String(c.offerOn) : null,
    hiredOn: c.hiredOn ? String(c.hiredOn) : null,
    lastFollowUpOn: c.lastFollowUpOn ? String(c.lastFollowUpOn) : null,
    followUpCount: c.followUpCount,
    notes: c.notes,
  }))

  // Funnel counts: a candidate at "Offer" has also passed Contacted+Interview.
  const counts = RECRUITMENT_STAGES.map((stage, idx) => {
    const count = candidates.filter(
      (c) =>
        c.status !== "Rejected" &&
        c.status !== "Withdrawn" &&
        reachedStageIndex(c.stage, RECRUITMENT_STAGES) >= idx,
    ).length
    return { stage, count, idx }
  })
  // Include rejected/withdrawn in the contacted top-of-funnel total.
  const totalContacted = candidates.length
  const stages: FunnelStageStat[] = counts.map((c, i) => ({
    stage: c.stage,
    count: i === 0 ? totalContacted : c.count,
    convFromPrev:
      i === 0
        ? null
        : counts[i - 1].count > 0
          ? Math.round((c.count / (i === 1 ? totalContacted : counts[i - 1].count)) * 100)
          : 0,
  }))

  const hired = candidates.filter((c) => c.stage === "Hired").length
  const rejected = candidates.filter(
    (c) => c.status === "Rejected" || c.status === "Withdrawn",
  ).length
  const active = candidates.filter(
    (c) => c.stage !== "Hired" && c.status === "Active",
  ).length
  const totalFollowUps = candidates.reduce((a, c) => a + c.followUpCount, 0)
  const overallConversion =
    totalContacted > 0 ? Math.round((hired / totalContacted) * 100) : 0

  return {
    candidates,
    active,
    hired,
    rejected,
    totalFollowUps,
    stages,
    overallConversion,
  }
}

// ---------------------------------------------------------------------------
// Training funnel — Enquiry -> Enrolled -> Completed -> Placed.
// ---------------------------------------------------------------------------

export const TRAINING_STAGES = [
  "Enquiry",
  "Enrolled",
  "Completed",
  "Placed",
] as const
export type TrainingStage = (typeof TRAINING_STAGES)[number]

export type TrainingLearnerRow = {
  id: number
  name: string
  program: string
  siteName: string | null
  stage: string
  status: string
  ownerName: string | null
  enquiryOn: string
  enrolledOn: string | null
  completedOn: string | null
  placedOn: string | null
  notes: string | null
}

export type TrainingFunnel = {
  learners: TrainingLearnerRow[]
  active: number
  placed: number
  dropped: number
  stages: FunnelStageStat[]
  overallConversion: number
}

export async function getTrainingFunnel(): Promise<TrainingFunnel> {
  const siteRows = await db.select({ id: sites.id, name: sites.name }).from(sites)
  const userRows = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
  const rows = await db
    .select()
    .from(trainingLearners)
    .orderBy(desc(trainingLearners.enquiryOn))

  const learners: TrainingLearnerRow[] = rows.map((l) => ({
    id: l.id,
    name: l.name,
    program: l.program,
    siteName: l.siteId ? (siteRows.find((s) => s.id === l.siteId)?.name ?? null) : null,
    stage: l.stage,
    status: l.status,
    ownerName: l.ownerUserId
      ? (userRows.find((u) => u.id === l.ownerUserId)?.name ?? null)
      : null,
    enquiryOn: String(l.enquiryOn),
    enrolledOn: l.enrolledOn ? String(l.enrolledOn) : null,
    completedOn: l.completedOn ? String(l.completedOn) : null,
    placedOn: l.placedOn ? String(l.placedOn) : null,
    notes: l.notes,
  }))

  const counts = TRAINING_STAGES.map((stage, idx) => {
    const count = learners.filter(
      (l) =>
        l.status !== "Dropped" &&
        reachedStageIndex(l.stage, TRAINING_STAGES) >= idx,
    ).length
    return { stage, count, idx }
  })
  const totalEnquiries = learners.length
  const stages: FunnelStageStat[] = counts.map((c, i) => ({
    stage: c.stage,
    count: i === 0 ? totalEnquiries : c.count,
    convFromPrev:
      i === 0
        ? null
        : counts[i - 1].count > 0
          ? Math.round((c.count / (i === 1 ? totalEnquiries : counts[i - 1].count)) * 100)
          : 0,
  }))

  const placed = learners.filter((l) => l.stage === "Placed").length
  const dropped = learners.filter((l) => l.status === "Dropped").length
  const active = learners.filter(
    (l) => l.stage !== "Placed" && l.status === "Active",
  ).length
  const overallConversion =
    totalEnquiries > 0 ? Math.round((placed / totalEnquiries) * 100) : 0

  return { learners, active, placed, dropped, stages, overallConversion }
}

// ---------------------------------------------------------------------------
// Behaviour / activity tracking — leading indicators (effort).
// ---------------------------------------------------------------------------

// Catalogue of trackable weekly activities by functional area.
export const ACTIVITY_TYPES: { area: string; type: string; label: string }[] = [
  { area: "Marketing", type: "posts", label: "Posts made" },
  { area: "HR", type: "contacts", label: "Recruitment contacts" },
  { area: "HR", type: "follow_ups", label: "Follow-ups" },
  { area: "HR", type: "interviews_booked", label: "Interviews booked" },
  { area: "Training", type: "academy_enquiries", label: "Academy enquiries" },
]

export type ActivityRow = {
  id: number
  functionArea: string
  activityType: string
  label: string
  siteName: string | null
  weekEnding: string
  count: number
  notes: string | null
}

export type ActivitySummary = {
  weekEnding: string | null
  byType: { area: string; type: string; label: string; count: number }[]
  recent: ActivityRow[]
}

export async function getActivitySummary(): Promise<ActivitySummary> {
  const siteRows = await db.select({ id: sites.id, name: sites.name }).from(sites)
  const rows = await db
    .select()
    .from(activityLog)
    .orderBy(desc(activityLog.weekEnding), desc(activityLog.createdAt))

  const labelFor = (area: string, type: string) =>
    ACTIVITY_TYPES.find((a) => a.area === area && a.type === type)?.label ?? type

  const recent: ActivityRow[] = rows.slice(0, 50).map((r) => ({
    id: r.id,
    functionArea: r.functionArea,
    activityType: r.activityType,
    label: labelFor(r.functionArea, r.activityType),
    siteName: r.siteId ? (siteRows.find((s) => s.id === r.siteId)?.name ?? null) : null,
    weekEnding: String(r.weekEnding),
    count: r.count,
    notes: r.notes,
  }))

  // Totals for the most recent week present.
  const weekEnding = rows.length > 0 ? String(rows[0].weekEnding) : null
  const thisWeek = weekEnding
    ? rows.filter((r) => String(r.weekEnding) === weekEnding)
    : []
  const byType = ACTIVITY_TYPES.map((a) => ({
    ...a,
    count: thisWeek
      .filter((r) => r.functionArea === a.area && r.activityType === a.type)
      .reduce((sum, r) => sum + r.count, 0),
  }))

  return { weekEnding, byType, recent }
}
