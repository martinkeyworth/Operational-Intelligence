"use server"

import { requireDashboard, requireDataEntry } from "@/lib/access"
import { db } from "@/lib/db"
import { jobPostings, jobReferrals } from "@/lib/db/schema"
import { getSuggestedJobs } from "@/lib/jobs"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type ActionResult = { ok: true } | { ok: false; error: string }

const clampMoney = (n: number) => Math.max(0, Math.min(100000, Math.round(n)))
const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : ""

function revalidateJobs() {
  revalidatePath("/jobs")
  revalidatePath("/my-work")
}

// ---------------------------------------------------------------------------
// Postings (dashboard users manage)
// ---------------------------------------------------------------------------

/** Create or update a posting. Pass `id` to edit. */
export async function saveJob(input: {
  id?: number
  title: string
  siteId?: number | null
  location?: string
  brand?: string
  role?: string
  description?: string
  employmentType?: string
  finderBonus?: number
  status?: string
}): Promise<ActionResult> {
  const user = await requireDashboard()
  const title = input.title?.trim()
  if (!title) return { ok: false, error: "A job title is required." }

  const values = {
    title,
    siteId: input.siteId ?? null,
    location: input.location?.trim() || null,
    brand: input.brand?.trim() || null,
    role: input.role?.trim() || null,
    description: input.description?.trim() || null,
    employmentType: input.employmentType?.trim() || "Full-time",
    finderBonus: String(clampMoney(input.finderBonus ?? 0)),
    status: input.status?.trim() || "open",
    updatedAt: new Date(),
  }

  try {
    if (input.id) {
      await db
        .update(jobPostings)
        .set(values)
        .where(eq(jobPostings.id, input.id))
    } else {
      await db
        .insert(jobPostings)
        .values({ ...values, source: "manual", createdByUserId: user.id })
    }
    revalidateJobs()
    return { ok: true }
  } catch (err) {
    console.error("[v0] saveJob failed:", err)
    return { ok: false, error: "Could not save the job. Please try again." }
  }
}

/** Save (or clear) a posting's manually-edited advert copy. Dashboard only.
 *  Pass an empty string to revert to the auto-generated advert. */
export async function saveAdvert(
  id: number,
  advertText: string,
): Promise<ActionResult> {
  await requireDashboard()
  try {
    const trimmed = advertText.trim()
    await db
      .update(jobPostings)
      .set({ advertText: trimmed || null, updatedAt: new Date() })
      .where(eq(jobPostings.id, id))
    revalidateJobs()
    return { ok: true }
  } catch (err) {
    console.error("[v0] saveAdvert failed:", err)
    return { ok: false, error: "Could not save the advert." }
  }
}

/** Set a posting's status (open | closed | filled). */
export async function setJobStatus(
  id: number,
  status: "open" | "closed" | "filled",
): Promise<ActionResult> {
  await requireDashboard()
  try {
    await db
      .update(jobPostings)
      .set({
        status,
        updatedAt: new Date(),
        closedAt: status === "open" ? null : new Date(),
      })
      .where(eq(jobPostings.id, id))
    revalidateJobs()
    return { ok: true }
  } catch (err) {
    console.error("[v0] setJobStatus failed:", err)
    return { ok: false, error: "Could not update status." }
  }
}

export async function deleteJob(id: number): Promise<ActionResult> {
  await requireDashboard()
  try {
    await db.delete(jobReferrals).where(eq(jobReferrals.jobId, id))
    await db.delete(jobPostings).where(eq(jobPostings.id, id))
    revalidateJobs()
    return { ok: true }
  } catch (err) {
    console.error("[v0] deleteJob failed:", err)
    return { ok: false, error: "Could not delete the job." }
  }
}

/** Delete every posting (and its referrals) to clear the board. Dashboard only. */
export async function deleteAllJobs(): Promise<ActionResult & { removed?: number }> {
  await requireDashboard()
  try {
    const rows = await db.select({ id: jobPostings.id }).from(jobPostings)
    if (rows.length === 0) return { ok: true, removed: 0 }
    await db.delete(jobReferrals)
    await db.delete(jobPostings)
    revalidateJobs()
    return { ok: true, removed: rows.length }
  } catch (err) {
    console.error("[v0] deleteAllJobs failed:", err)
    return { ok: false, error: "Could not clear the board." }
  }
}

/** Publish one auto-suggested job by its sourceKey. */
export async function publishSuggestion(sourceKey: string): Promise<ActionResult> {
  const user = await requireDashboard()
  try {
    const suggestions = await getSuggestedJobs()
    const s = suggestions.find((x) => x.sourceKey === sourceKey)
    if (!s) return { ok: false, error: "Suggestion no longer available." }

    // The unique index on source_key is partial (WHERE source_key IS NOT NULL),
    // so ON CONFLICT inference is unreliable. Guard with an explicit check.
    const existing = await db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(eq(jobPostings.sourceKey, s.sourceKey))
    if (existing.length > 0) {
      revalidateJobs()
      return { ok: true }
    }

    await db.insert(jobPostings).values({
      title: s.title,
      siteId: s.siteId,
      location: s.location,
      brand: s.brand,
      role: s.role,
      description: s.description,
      employmentType: "Full-time",
      finderBonus: String(s.suggestedBonus),
      status: "open",
      source: s.source,
      sourceKey: s.sourceKey,
      createdByUserId: user.id,
    })
    revalidateJobs()
    return { ok: true }
  } catch (err) {
    console.error("[v0] publishSuggestion failed:", err)
    return { ok: false, error: "Could not publish the suggestion." }
  }
}

/** Publish every current auto-suggested job in one go (manual bulk load). */
export async function publishAllSuggestions(): Promise<
  ActionResult & { added?: number }
> {
  const user = await requireDashboard()
  try {
    const suggestions = await getSuggestedJobs()
    if (suggestions.length === 0) return { ok: true, added: 0 }

    // Skip any sourceKeys already on the board (partial unique index means
    // ON CONFLICT inference is unreliable, so filter explicitly).
    const existing = await db
      .select({ sourceKey: jobPostings.sourceKey })
      .from(jobPostings)
    const taken = new Set(existing.map((e) => e.sourceKey).filter(Boolean))

    const rows = suggestions
      .filter((s) => !taken.has(s.sourceKey))
      .map((s) => ({
        title: s.title,
        siteId: s.siteId,
        location: s.location,
        brand: s.brand,
        role: s.role,
        description: s.description,
        employmentType: "Full-time",
        finderBonus: String(s.suggestedBonus),
        status: "open",
        source: s.source,
        sourceKey: s.sourceKey,
        createdByUserId: user.id,
      }))

    if (rows.length === 0) return { ok: true, added: 0 }

    await db.insert(jobPostings).values(rows)
    revalidateJobs()
    return { ok: true, added: rows.length }
  } catch (err) {
    console.error("[v0] publishAllSuggestions failed:", err)
    return { ok: false, error: "Could not load the suggested jobs." }
  }
}

// ---------------------------------------------------------------------------
// Referrals (staff submit, dashboard manages bonuses)
// ---------------------------------------------------------------------------

/** Submit a referral against an open job. Any data-entry user (barbers + dashboard). */
export async function submitReferral(formData: FormData): Promise<ActionResult> {
  const user = await requireDataEntry()
  const jobId = Number(str(formData.get("jobId")))
  const candidateName = str(formData.get("candidateName"))
  if (!jobId || !candidateName)
    return { ok: false, error: "Candidate name is required." }

  try {
    const [job] = await db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.id, jobId))
    if (!job || job.status !== "open")
      return { ok: false, error: "This job is no longer open." }

    await db.insert(jobReferrals).values({
      jobId,
      candidateName,
      candidateContact: str(formData.get("candidateContact")) || null,
      note: str(formData.get("note")) || null,
      finderUserId: user.id,
      finderName: user.name || user.email,
      status: "submitted",
      bonusStatus: "pending",
      // Default the bonus to the posting's advertised finder's bonus.
      bonusAmount: job.finderBonus,
    })
    revalidateJobs()
    return { ok: true }
  } catch (err) {
    console.error("[v0] submitReferral failed:", err)
    return { ok: false, error: "Could not submit the referral." }
  }
}

/** Update a referral's hiring status. Dashboard only. */
export async function setReferralStatus(
  id: number,
  status: "submitted" | "interviewing" | "hired" | "rejected",
): Promise<ActionResult> {
  await requireDashboard()
  try {
    await db
      .update(jobReferrals)
      .set({ status, updatedAt: new Date() })
      .where(eq(jobReferrals.id, id))
    revalidateJobs()
    return { ok: true }
  } catch (err) {
    console.error("[v0] setReferralStatus failed:", err)
    return { ok: false, error: "Could not update the referral." }
  }
}

/** Update the finder-bonus state for a referral. Dashboard only. */
export async function setBonusStatus(
  id: number,
  bonusStatus: "pending" | "approved" | "paid" | "void",
  bonusAmount?: number,
): Promise<ActionResult> {
  await requireDashboard()
  try {
    await db
      .update(jobReferrals)
      .set({
        bonusStatus,
        ...(bonusAmount != null ? { bonusAmount: String(clampMoney(bonusAmount)) } : {}),
        paidAt: bonusStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(jobReferrals.id, id))
    revalidateJobs()
    return { ok: true }
  } catch (err) {
    console.error("[v0] setBonusStatus failed:", err)
    return { ok: false, error: "Could not update the bonus." }
  }
}
