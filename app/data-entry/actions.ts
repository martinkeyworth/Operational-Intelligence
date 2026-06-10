"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { weeklyTakings, barbers } from "@/lib/db/schema"
import { requireDataEntry } from "@/lib/access"
import { getBarberForUser } from "@/lib/team"

export async function saveWeeklyTakings(formData: FormData) {
  const user = await requireDataEntry()

  const barberId = Number(formData.get("barberId"))
  const weekEnding = String(formData.get("weekEnding"))
  const confirmedSiteId = Number(formData.get("siteId")) || 0
  const cash = Number(formData.get("cash") ?? 0) || 0
  const card = Number(formData.get("card") ?? 0) || 0
  const cashRent = Number(formData.get("cashRent") ?? 0) || 0
  const cardRent = Number(formData.get("cardRent") ?? 0) || 0
  const manager = String(formData.get("manager") ?? "").trim()
  const transferCompleted = formData.get("transferCompleted") === "on"
  const comments = String(formData.get("comments") ?? "").trim() || null

  if (!barberId || !weekEnding) throw new Error("Barber and week are required")

  // Ownership guard: a barber who can't view the dashboard may only submit
  // their own takings. Managers/dashboard users may submit on behalf of any
  // barber. This prevents a barber forging another barber's id in the form.
  if (!user.canViewDashboard) {
    const ownBarber = await getBarberForUser(user.id)
    if (!ownBarber) throw new Error("Your account isn't linked to a barber")
    if (ownBarber.id !== barberId) throw new Error("Not authorised for this barber")
  }

  // Resolve the barber's site for the denormalised siteId column. The barber
  // confirms their base/working location each week on submission — if it has
  // changed, update their base so future site KPIs roll up correctly.
  const [barber] = await db
    .select({ siteId: barbers.siteId })
    .from(barbers)
    .where(eq(barbers.id, barberId))
  if (!barber) throw new Error("Unknown barber")

  const siteId = confirmedSiteId || barber.siteId
  if (confirmedSiteId && confirmedSiteId !== barber.siteId) {
    await db
      .update(barbers)
      .set({ siteId: confirmedSiteId })
      .where(eq(barbers.id, barberId))
  }

  const total = cash + card

  const values = {
    siteId,
    total: String(total),
    cash: String(cash),
    card: String(card),
    cashRent: String(cashRent),
    cardRent: String(cardRent),
    manager,
    transferCompleted,
    comments,
  }

  // Upsert: one takings row per barber per week.
  const existing = await db
    .select({ id: weeklyTakings.id })
    .from(weeklyTakings)
    .where(
      and(
        eq(weeklyTakings.barberId, barberId),
        eq(weeklyTakings.weekEnding, weekEnding),
      ),
    )

  if (existing.length > 0) {
    await db
      .update(weeklyTakings)
      .set(values)
      .where(eq(weeklyTakings.id, existing[0].id))
  } else {
    await db.insert(weeklyTakings).values({ barberId, weekEnding, ...values })
  }

  revalidatePath("/data-entry")
  revalidatePath("/")
  revalidatePath("/sites")
  revalidatePath("/admin/splits")
}
