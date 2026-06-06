"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  sites,
  actions,
  siteConfirmations,
  sublettingTakings,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { SUBLET_WEEKLY_TARGET } from "@/lib/subletting-config"
import { fmtWeekLong } from "@/lib/format"

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

/** Record a site's weekly subletting (chair/room rent) income.
 *  Below the weekly target is RED and raises a quarterly review action. */
export async function saveSubletting(formData: FormData) {
  const user = await requireUser()
  const siteId = Number(formData.get("siteId"))
  const weekEnding = String(formData.get("weekEnding"))
  const amount = Number(formData.get("amount") ?? 0) || 0
  const targetRaw = formData.get("target")
  const target =
    targetRaw && String(targetRaw).trim()
      ? Number(targetRaw)
      : SUBLET_WEEKLY_TARGET
  const notes = String(formData.get("notes") ?? "").trim() || null
  if (!siteId || !weekEnding) throw new Error("Missing site or week")

  const recordedBy = user.name || user.email

  const existing = await db
    .select({ id: sublettingTakings.id })
    .from(sublettingTakings)
    .where(
      and(
        eq(sublettingTakings.siteId, siteId),
        eq(sublettingTakings.weekEnding, weekEnding),
      ),
    )

  const values = {
    amount: String(amount),
    target: String(target),
    recordedBy,
    notes,
  }

  if (existing.length > 0) {
    await db
      .update(sublettingTakings)
      .set(values)
      .where(eq(sublettingTakings.id, existing[0].id))
  } else {
    await db
      .insert(sublettingTakings)
      .values({ siteId, weekEnding, ...values })
  }

  // Below target → ensure an open quarterly review action exists for this site.
  if (amount < target) {
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
    const siteName = site?.name ?? "Site"
    const title = `Subletting below target — ${siteName}`
    const open = await db
      .select({ id: actions.id })
      .from(actions)
      .where(
        and(
          eq(actions.title, title),
          eq(actions.functionArea, "Subletting"),
        ),
      )
    const description = `Weekly subletting income was below the £${SUBLET_WEEKLY_TARGET} target (W/E ${fmtWeekLong(
      weekEnding,
    )}). Review quarterly and agree corrective action with the site manager.`

    if (open.length === 0) {
      await db.insert(actions).values({
        title,
        description,
        functionArea: "Subletting",
        siteId,
        owner: recordedBy,
        priority: "High",
        status: "Open",
        rag: "red",
        escalated: false,
      })
    } else {
      // Refresh the existing action so it reflects the latest week.
      await db
        .update(actions)
        .set({ description, rag: "red", status: "Open" })
        .where(eq(actions.id, open[0].id))
    }
  }

  revalidatePath("/sites")
  revalidatePath(`/sites/${siteId}`)
  revalidatePath("/actions")
  revalidatePath("/")
}
