"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/access"
import { ensureBarberForUser } from "@/lib/team"
import {
  addTakingsLineEntry,
  deleteTakingsLineEntry,
} from "@/lib/daily-takings"
import { todayIso } from "@/lib/format"

/** Barbers can only add/remove cuts for the current day — once the day rolls
 *  over, that day's takings lock. */
function assertToday(date: string) {
  if (date !== todayIso()) {
    throw new Error("This day is locked — you can only change today's takings.")
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

/** Add one haircut to today's takings (amount + cash/card). */
export async function addTakingsLine(formData: FormData) {
  const { user, barber } = await currentBarber()

  const date = todayIso()
  assertToday(date)

  const amount = Math.max(0, Number(formData.get("amount")) || 0)
  const method = String(formData.get("method") ?? "cash") === "card" ? "card" : "cash"
  if (amount <= 0) return { ok: false as const, error: "Enter an amount." }

  await addTakingsLineEntry({
    barberId: barber.id,
    siteId: barber.siteId,
    date,
    amount,
    method,
    enteredByUserId: user.id,
  })

  revalidateTakings(barber.siteId)
  return { ok: true as const }
}

/** Remove a cut logged today (own entries only, today only). */
export async function deleteTakingsLine(formData: FormData) {
  const { barber } = await currentBarber()
  const id = Number(formData.get("id"))
  if (!Number.isFinite(id)) return { ok: false as const }

  const result = await deleteTakingsLineEntry({
    id,
    barberId: barber.id,
    siteId: barber.siteId,
  })
  // Guard the lock: only today's lines may be removed.
  if (result) assertToday(result.date)

  revalidateTakings(barber.siteId)
  return { ok: true as const }
}
