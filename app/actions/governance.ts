"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sites, actions, siteConfirmations } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user
}

export async function createSite(formData: FormData) {
  await requireUser()
  const name = String(formData.get("name") ?? "").trim()
  const location = String(formData.get("location") ?? "").trim()
  const brand = String(formData.get("brand") ?? "").trim() || "Less Than Zero"
  const region = String(formData.get("region") ?? "").trim() || null
  const managerName = String(formData.get("managerName") ?? "").trim() || null
  if (!name || !location) throw new Error("Name and location are required")

  await db.insert(sites).values({
    name,
    location,
    brand,
    region,
    managerName,
    monthlyTarget: "0",
    rag: "green",
  })
  revalidatePath("/sites")
  revalidatePath("/")
}

export async function setActionStatus(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  const status = String(formData.get("status"))
  if (!id || !status) return
  await db.update(actions).set({ status }).where(eq(actions.id, id))
  revalidatePath("/actions")
  revalidatePath("/")
}

export async function confirmSiteWeek(formData: FormData) {
  const user = await requireUser()
  const siteId = Number(formData.get("siteId"))
  const weekEnding = String(formData.get("weekEnding"))
  const siteNameConfirmed = String(formData.get("siteNameConfirmed") ?? "").trim()
  const locationConfirmed = String(formData.get("locationConfirmed") ?? "").trim()
  const brandConfirmed = String(formData.get("brandConfirmed") ?? "").trim()
  const managerConfirmed = String(formData.get("managerConfirmed") ?? "").trim()
  const headcountRaw = formData.get("headcountConfirmed")
  const headcountConfirmed =
    headcountRaw && String(headcountRaw).trim() ? Number(headcountRaw) : null
  const notes = String(formData.get("notes") ?? "").trim() || null
  if (!siteId || !weekEnding) throw new Error("Missing site or week")

  const existing = await db
    .select()
    .from(siteConfirmations)
    .where(
      and(
        eq(siteConfirmations.siteId, siteId),
        eq(siteConfirmations.weekEnding, weekEnding),
      ),
    )

  const values = {
    confirmed: true,
    confirmedBy: user.name || user.email,
    confirmedRole: (user as { role?: string }).role ?? "Functional Leader",
    siteNameConfirmed: siteNameConfirmed || null,
    locationConfirmed: locationConfirmed || null,
    brandConfirmed: brandConfirmed || null,
    managerConfirmed: managerConfirmed || null,
    headcountConfirmed,
    notes,
    confirmedAt: new Date(),
  }

  if (existing.length > 0) {
    await db
      .update(siteConfirmations)
      .set(values)
      .where(eq(siteConfirmations.id, existing[0].id))
  } else {
    await db.insert(siteConfirmations).values({ siteId, weekEnding, ...values })
  }
  revalidatePath("/sites")
  revalidatePath("/")
}
