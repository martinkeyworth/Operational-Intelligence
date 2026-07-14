"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/access"
import { ensureBarberForUser } from "@/lib/team"
import { recordDailyTakings } from "@/lib/daily-takings"
import { weekEndingFor, todayIso } from "@/lib/format"

/**
 * Save the signed-in barber's takings for a given day (defaults to today).
 * Writes one daily_takings row and recomputes their weekly rollup + RTB.
 * The barber is always resolved from the session — never trusted from input.
 */
export async function saveTodayTakings(formData: FormData) {
  const user = await requireUser()
  const barber = await ensureBarberForUser({
    id: user.id,
    name: user.name,
    email: user.email,
  })

  const date = String(formData.get("date") ?? "").trim() || todayIso()
  const cash = Math.max(0, Number(formData.get("cash")) || 0)
  const card = Math.max(0, Number(formData.get("card")) || 0)

  await recordDailyTakings({
    barberId: barber.id,
    siteId: barber.siteId,
    date,
    cash,
    card,
    enteredByUserId: user.id,
    source: "in-app",
  })

  revalidatePath("/today")
  // Keep the wider takings surfaces in sync with the new daily figures.
  revalidatePath("/data-entry")
  revalidatePath(`/my-site/${barber.siteId}`)
  revalidatePath(`/sites/${barber.siteId}`)

  return { ok: true, date, weekEnding: weekEndingFor(date) }
}
