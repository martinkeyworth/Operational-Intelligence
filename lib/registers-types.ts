// Client-safe types and constants for the registers feature.
// This file MUST NOT import "server-only", the db, or the schema, because it
// is imported by Client Components. Keep it free of any server-only runtime.

export type SiteOption = { id: number; name: string }

// ---------------------------------------------------------------------------
// Decision Register — completes RAID (the "D").
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
