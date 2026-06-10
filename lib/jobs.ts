import "server-only"
import { db } from "@/lib/db"
import { jobPostings, jobReferrals, sites } from "@/lib/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
import { getRecruitmentPlan, type RoleBucket } from "@/lib/hr"
import { tierForBrand } from "@/lib/plan"
import { formatJobAdvert as formatAdvert } from "@/lib/jobs-format"

// ---------------------------------------------------------------------------
// Jobs board
// ---------------------------------------------------------------------------
// Vacancies advertised to staff (and usable as external/social adverts).
// Postings are either created manually by dashboard users or auto-suggested
// from the HR & growth requirements (current role gaps + opening pipeline) and
// then confirmed/published. Each posting can carry a finder's bonus paid to
// whoever refers a successful hire.

export type JobStatus = "open" | "closed" | "filled"
export type ReferralStatus = "submitted" | "interviewing" | "hired" | "rejected"
export type BonusStatus = "pending" | "approved" | "paid" | "void"

export type JobPosting = {
  id: number
  title: string
  siteId: number | null
  siteName: string | null
  location: string | null
  brand: string | null
  role: string | null
  description: string | null
  advertText: string | null
  employmentType: string
  status: JobStatus
  finderBonus: number
  source: string // manual | gap | pipeline
  sourceKey: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  referralCount: number
  hiredCount: number
}

export type JobReferral = {
  id: number
  jobId: number
  candidateName: string
  candidateContact: string | null
  note: string | null
  finderUserId: string | null
  finderName: string | null
  status: ReferralStatus
  bonusStatus: BonusStatus
  bonusAmount: number | null
  paidAt: string | null
  createdAt: string
}

/** A derived posting suggestion not yet saved to the board. */
export type SuggestedJob = {
  sourceKey: string
  source: "gap" | "pipeline"
  title: string
  siteId: number | null
  location: string | null
  brand: string | null
  role: RoleBucket
  count: number
  description: string
  suggestedBonus: number
}

// Default finder's bonus per role (£). Senior/scarce roles are worth more.
const DEFAULT_BONUS_BY_ROLE: Record<RoleBucket, number> = {
  Manager: 500,
  "Senior Barber": 300,
  Barber: 250,
  "Junior Barber": 150,
  Apprentice: 100,
  Trainer: 400,
  Assessor: 400,
}

function bonusForRole(role: RoleBucket): number {
  return DEFAULT_BONUS_BY_ROLE[role] ?? 200
}

function iso(d: Date | string | null): string | null {
  if (!d) return null
  return typeof d === "string" ? d : d.toISOString()
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type ListOpts = { status?: JobStatus | "all"; openOnly?: boolean }

/** List postings with referral counts. Defaults to every posting (newest
 *  first); pass `openOnly` for the barber-facing board. */
export async function listJobs(opts: ListOpts = {}): Promise<JobPosting[]> {
  const rows = await db
    .select({
      job: jobPostings,
      siteName: sites.name,
      referralCount: sql<number>`count(${jobReferrals.id})`,
      hiredCount: sql<number>`count(${jobReferrals.id}) filter (where ${jobReferrals.status} = 'hired')`,
    })
    .from(jobPostings)
    .leftJoin(sites, eq(jobPostings.siteId, sites.id))
    .leftJoin(jobReferrals, eq(jobReferrals.jobId, jobPostings.id))
    .groupBy(jobPostings.id, sites.name)
    .orderBy(desc(jobPostings.createdAt))

  let result = rows.map((r) => mapPosting(r.job, r.siteName, r.referralCount, r.hiredCount))

  if (opts.openOnly) result = result.filter((j) => j.status === "open")
  else if (opts.status && opts.status !== "all")
    result = result.filter((j) => j.status === opts.status)

  return result
}

export async function getJob(id: number): Promise<JobPosting | null> {
  const [row] = await db
    .select({
      job: jobPostings,
      siteName: sites.name,
      referralCount: sql<number>`count(${jobReferrals.id})`,
      hiredCount: sql<number>`count(${jobReferrals.id}) filter (where ${jobReferrals.status} = 'hired')`,
    })
    .from(jobPostings)
    .leftJoin(sites, eq(jobPostings.siteId, sites.id))
    .leftJoin(jobReferrals, eq(jobReferrals.jobId, jobPostings.id))
    .where(eq(jobPostings.id, id))
    .groupBy(jobPostings.id, sites.name)
  if (!row) return null
  return mapPosting(row.job, row.siteName, row.referralCount, row.hiredCount)
}

export async function getReferralsForJob(jobId: number): Promise<JobReferral[]> {
  const rows = await db
    .select()
    .from(jobReferrals)
    .where(eq(jobReferrals.jobId, jobId))
    .orderBy(desc(jobReferrals.createdAt))
  return rows.map(mapReferral)
}

/** All referrals across the board (for the bonus tracker), newest first. */
export async function getAllReferrals(): Promise<
  (JobReferral & { jobTitle: string })[]
> {
  const rows = await db
    .select({ ref: jobReferrals, jobTitle: jobPostings.title })
    .from(jobReferrals)
    .leftJoin(jobPostings, eq(jobReferrals.jobId, jobPostings.id))
    .orderBy(desc(jobReferrals.createdAt))
  return rows.map((r) => ({ ...mapReferral(r.ref), jobTitle: r.jobTitle ?? "—" }))
}

type BonusTotals = {
  pending: number
  approved: number
  paid: number
}

/** Aggregate finder-bonus liabilities by status. */
export async function getBonusTotals(): Promise<BonusTotals> {
  const refs = await db.select().from(jobReferrals)
  const totals: BonusTotals = { pending: 0, approved: 0, paid: 0 }
  for (const r of refs) {
    const amt = r.bonusAmount != null ? Number(r.bonusAmount) : 0
    if (r.bonusStatus === "paid") totals.paid += amt
    else if (r.bonusStatus === "approved") totals.approved += amt
    else if (r.bonusStatus === "pending") totals.pending += amt
  }
  return totals
}

// ---------------------------------------------------------------------------
// Auto-suggestions from the HR & growth requirements
// ---------------------------------------------------------------------------

/** Derive job suggestions from current role gaps + the opening pipeline.
 *  Excludes anything already represented on the board (by sourceKey). */
export async function getSuggestedJobs(): Promise<SuggestedJob[]> {
  const [plan, existing] = await Promise.all([
    getRecruitmentPlan(),
    db
      .select({ sourceKey: jobPostings.sourceKey })
      .from(jobPostings)
      .where(sql`${jobPostings.sourceKey} is not null`),
  ])
  const taken = new Set(existing.map((e) => e.sourceKey))
  const out: SuggestedJob[] = []

  // 1) Current per-site role gaps (vacancies in open shops).
  for (const site of plan.sites) {
    for (const line of site.lines) {
      if (line.gap <= 0) continue
      const key = `gap:${site.siteId}:${line.role}`
      if (taken.has(key)) continue
      out.push({
        sourceKey: key,
        source: "gap",
        title: `${line.role} — ${site.siteName}`,
        siteId: site.siteId,
        location: site.siteName,
        brand: site.brand,
        role: line.role,
        count: line.gap,
        suggestedBonus: bonusForRole(line.role),
        description: describeRole(line.role, site.brand, site.siteName, line.gap),
      })
    }
  }

  // 2) Forward pipeline for planned openings.
  for (const op of plan.pipeline) {
    for (const r of op.roles) {
      if (r.count <= 0) continue
      const key = `pipeline:${op.location}:${op.year}:${op.month}:${r.role}`
      if (taken.has(key)) continue
      const brand = op.tier // tier label stands in for brand on new sites
      out.push({
        sourceKey: key,
        source: "pipeline",
        title: `${r.role} — ${op.location} (opening ${monthName(op.month)} ${op.year})`,
        siteId: null,
        location: op.location,
        brand,
        role: r.role,
        count: r.count,
        suggestedBonus: bonusForRole(r.role),
        description: describeRole(r.role, brand, op.location, r.count, {
          year: op.year,
          month: op.month,
        }),
      })
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Advert formatting (social-ready copy)
// ---------------------------------------------------------------------------

/** Build a ready-to-post job advert from a posting. Suitable for pasting into
 *  social media or a careers page. */
export function formatJobAdvert(job: JobPosting): string {
  // A saved manual edit always wins over the auto-generated copy.
  if (job.advertText && job.advertText.trim()) return job.advertText
  return formatAdvert(job)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeRole(
  role: RoleBucket,
  brand: string | null,
  location: string | null,
  count: number,
  opening?: { year: number; month: number },
): string {
  const where = location ? ` at our ${location} shop` : ""
  const brandLabel = brand ? `${brand} ` : ""
  const plural = count > 1 ? `${count} ${role}s` : `a ${role}`
  const when = opening
    ? ` ahead of our ${monthName(opening.month)} ${opening.year} opening`
    : ""
  const responsibilities: Record<RoleBucket, string> = {
    Manager:
      "lead the floor, drive Revenue-To-Business, mentor the team and hit the weekly KPIs",
    "Senior Barber": "deliver premium cuts, build a loyal column and set the standard on the floor",
    Barber: "deliver great cuts, grow your column and contribute to weekly takings",
    "Junior Barber": "build your skills on a busy floor with support from senior staff",
    Apprentice: "train on the job toward full qualification while earning",
    Trainer: "develop our learners and apprentices through the academy programme",
    Assessor: "assess apprentices against standards and sign off competencies",
  }
  return (
    `We're looking for ${plural} to join the ${brandLabel}team${where}${when}. ` +
    `You'll ${responsibilities[role]}.`
  )
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
function monthName(m: number): string {
  return MONTHS[(m - 1 + 12) % 12] ?? ""
}

function mapPosting(
  job: typeof jobPostings.$inferSelect,
  siteName: string | null,
  referralCount: number,
  hiredCount: number,
): JobPosting {
  return {
    id: job.id,
    title: job.title,
    siteId: job.siteId ?? null,
    siteName: siteName ?? null,
    location: job.location ?? null,
    brand: job.brand ?? null,
    role: job.role ?? null,
    description: job.description ?? null,
    advertText: job.advertText ?? null,
    employmentType: job.employmentType,
    status: job.status as JobStatus,
    finderBonus: Number(job.finderBonus ?? 0),
    source: job.source,
    sourceKey: job.sourceKey ?? null,
    createdAt: iso(job.createdAt)!,
    updatedAt: iso(job.updatedAt)!,
    closedAt: iso(job.closedAt),
    referralCount: Number(referralCount ?? 0),
    hiredCount: Number(hiredCount ?? 0),
  }
}

function mapReferral(r: typeof jobReferrals.$inferSelect): JobReferral {
  return {
    id: r.id,
    jobId: r.jobId,
    candidateName: r.candidateName,
    candidateContact: r.candidateContact ?? null,
    note: r.note ?? null,
    finderUserId: r.finderUserId ?? null,
    finderName: r.finderName ?? null,
    status: r.status as ReferralStatus,
    bonusStatus: r.bonusStatus as BonusStatus,
    bonusAmount: r.bonusAmount != null ? Number(r.bonusAmount) : null,
    paidAt: iso(r.paidAt),
    createdAt: iso(r.createdAt)!,
  }
}

// Re-export so UI can label tiers/brands consistently.
export { tierForBrand }
