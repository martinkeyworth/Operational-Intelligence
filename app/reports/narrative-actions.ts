"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { weeklyReports } from "@/lib/db/schema"
import { requireUser } from "@/lib/access"
import { getOrCreateReport } from "@/lib/reporting"

/** Cosmin (COO) submits his narrative for a week. Owners may also edit. */
export async function saveCosminNarrative(formData: FormData) {
  const user = await requireUser()
  const weekEnding = String(formData.get("weekEnding") ?? "")
  const text = String(formData.get("narrative") ?? "").trim()
  if (!weekEnding) throw new Error("Missing week")

  const isCosmin = user.email.toLowerCase().startsWith("cosmin@")
  if (!isCosmin && !user.isOwner) throw new Error("Not authorised")

  // Ensure a report row exists — otherwise the UPDATE below silently hits 0
  // rows and the narrative is lost (the bug the COO/CEO were hitting).
  await getOrCreateReport(weekEnding)
  await db
    .update(weeklyReports)
    .set({ cosminNarrative: text || null, cosminNarrativeAt: new Date() })
    .where(eq(weeklyReports.weekEnding, weekEnding))
  revalidatePath(`/reports/${weekEnding}`)

  // Event-driven handoff: advance the cadence NOW so the COO narrative
  // immediately requests the CEO response instead of waiting for the next
  // cron tick (which only runs in the Sat→Mon window, so outside it the CEO
  // email was never generated). Best-effort — a failure must not block save.
  await advanceCadenceSafely(weekEnding)
}

// Nudge the weekly cadence forward after a leadership submit. Dynamically
// imported to avoid pulling the heavy workflow module (and any circular deps)
// into this action's load path; wrapped so a failure never breaks the save.
async function advanceCadenceSafely(weekEnding: string) {
  try {
    const { advanceWeeklyCadence } = await import("@/lib/weekly-workflow")
    await advanceWeeklyCadence(weekEnding)
  } catch (err) {
    console.log("[v0] advanceWeeklyCadence after narrative/response failed:", err)
  }
}

/** Martin (CEO) submits his response for a week. Owners may also edit. */
export async function saveMartinResponse(formData: FormData) {
  const user = await requireUser()
  const weekEnding = String(formData.get("weekEnding") ?? "")
  const text = String(formData.get("response") ?? "").trim()
  if (!weekEnding) throw new Error("Missing week")

  const isMartin = user.email.toLowerCase().startsWith("martin@")
  if (!isMartin && !user.isOwner) throw new Error("Not authorised")

  await getOrCreateReport(weekEnding)
  await db
    .update(weeklyReports)
    .set({ martinResponse: text || null, martinResponseAt: new Date() })
    .where(eq(weeklyReports.weekEnding, weekEnding))
  revalidatePath(`/reports/${weekEnding}`)

  // Event-driven handoff: advancing now progresses the CEO response into the
  // final AI wrap-around (and the board report send once complete) rather than
  // waiting for the next cron tick.
  await advanceCadenceSafely(weekEnding)
}
