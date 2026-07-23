"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/access"
import { ensureBarberForUser } from "@/lib/team"
import {
  addTakingsLineEntry,
  deleteTakingsLineEntry,
  isSiteWeekConfirmed,
} from "@/lib/daily-takings"
import { todayIso, weekEndingFor } from "@/lib/format"

/**
 * A barber may add/remove cuts for ANY day of the CURRENT week, up to today,
 * for as long as the manager hasn't yet confirmed (signed off) the site's week.
 * This lets someone back-fill a day they forgot without ever rewriting a future
 * day or an already signed-off week. Throws with a clear message otherwise.
 */
async function assertEditable(date: string, siteId: number) {
  const today = todayIso()
  if (date > today) {
    throw new Error("You can't log takings for a day that hasn't happened yet.")
  }
  if (weekEndingFor(date) !== weekEndingFor(today)) {
    throw new Error(
      "That day is in a previous week and is locked. You can only edit the current week.",
    )
  }
  if (await isSiteWeekConfirmed(siteId, weekEndingFor(date))) {
    throw new Error(
      "This week has been signed off by your manager, so takings are locked.",
    )
  }
}

async function currentBarber() {
  const user = await requireUser()
  const barber = await ensureBarberForUser({
    id: user.id,
    name: user.name,
    email: user.email,
  })
  return { user, barber }
}

function revalidateTakings(siteId: number) {
  revalidatePath("/today")
  revalidatePath("/data-entry")
  revalidatePath(`/my-site/${siteId}`)
  revalidatePath(`/sites/${siteId}`)
}

/**
 * Add one line to today's takings. `kind` = cut (default, amount + cash/card),
 * no_show (auto-charged to card, awaits manager sign-off) or tip (100% barber).
 */
export async function addTakingsLine(formData: FormData) {
  const { user, barber } = await currentBarber()

  const rawDate = String(formData.get("date") ?? "").trim()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayIso()
  await assertEditable(date, barber.siteId)

  const amount = Math.max(0, Number(formData.get("amount")) || 0)
  const method = String(formData.get("method") ?? "cash") === "card" ? "card" : "cash"
  const rawKind = String(formData.get("kind") ?? "cut")
  const kind = rawKind === "no_show" || rawKind === "tip" ? rawKind : "cut"
  if (amount <= 0) return { ok: false as const, error: "Enter an amount." }

  await addTakingsLineEntry({
    barberId: barber.id,
    siteId: barber.siteId,
    date,
    amount,
    method,
    kind,
    enteredByUserId: user.id,
  })

  revalidateTakings(barber.siteId)
  return { ok: true as const }
}

/** Remove a line (own entries only) — current week, before the manager signs
 *  off. */
export async function deleteTakingsLine(formData: FormData) {
  const { barber } = await currentBarber()
  const id = Number(formData.get("id"))
  if (!Number.isFinite(id)) return { ok: false as const }

  const rawDate = String(formData.get("date") ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    // Guard the lock BEFORE deleting so a locked line is never removed.
    await assertEditable(rawDate, barber.siteId)
  }

  await deleteTakingsLineEntry({
    id,
    barberId: barber.id,
    siteId: barber.siteId,
  })

  revalidateTakings(barber.siteId)
  return { ok: true as const }
}
