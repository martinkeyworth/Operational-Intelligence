"use server"

import { db } from "@/lib/db"
import {
  sites,
  barbers,
  actions,
  siteConfirmations,
  sublettingTakings,
  trainingWeeks,
  weeklyTakings,
  user,
} from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireDashboard, requireDataEntry } from "@/lib/access"
import { SUBLET_WEEKLY_TARGET } from "@/lib/subletting-config"
import { fmtWeekLong, fmtGBP } from "@/lib/format"

/**
 * Ensure a single open action exists for a given title/function area, or
 * resolve (close) it when the underlying KPI recovers. Used by the capacity,
 * RTB, subletting and training KPIs to auto-raise red actions.
 */
async function syncKpiAction(opts: {
  open: boolean
  title: string
  functionArea: string
  siteId: number
  owner: string
  description: string
  priority?: string
}) {
  const existing = await db
    .select({ id: actions.id })
    .from(actions)
    .where(
      and(eq(actions.title, opts.title), eq(actions.functionArea, opts.functionArea)),
    )

  if (opts.open) {
    if (existing.length === 0) {
      await db.insert(actions).values({
        title: opts.title,
        description: opts.description,
        functionArea: opts.functionArea,
        siteId: opts.siteId,
        owner: opts.owner,
        priority: opts.priority ?? "High",
        status: "Open",
        rag: "red",
        escalated: false,
      })
    } else {
      await db
        .update(actions)
        .set({ description: opts.description, rag: "red", status: "Open" })
        .where(eq(actions.id, existing[0].id))
    }
  } else if (existing.length > 0) {
    await db
      .update(actions)
      .set({ status: "Closed", rag: "green" })
      .where(eq(actions.id, existing[0].id))
  }
}

async function requireUser() {
  return requireDashboard()
}

export async function createSite(formData: FormData) {
  await requireUser()
  const name = String(formData.get("name") ?? "").trim()
  const location = String(formData.get("location") ?? "").trim()
  const brand = String(formData.get("brand") ?? "").trim() || "Less Than Zero"
  const region = String(formData.get("region") ?? "").trim() || null
  const managerName = String(formData.get("managerName") ?? "").trim() || null
  const headcount = Number(formData.get("headcount") ?? 0) || 0
  const siteType = String(formData.get("siteType") ?? "barbershop").trim()
  const chairCapacity = Number(formData.get("chairCapacity") ?? 0) || 0
  const learnerCapacity = Number(formData.get("learnerCapacity") ?? 0) || 0
  const apprenticeCapacity = Number(formData.get("apprenticeCapacity") ?? 0) || 0
  if (!name || !location) throw new Error("Name and location are required")

  await db.insert(sites).values({
    name,
    location,
    brand,
    region,
    managerName,
    headcount,
    siteType: siteType === "training" ? "training" : "barbershop",
    chairCapacity,
    learnerCapacity,
    apprenticeCapacity,
    monthlyTarget: "0",
    rag: "green",
  })
  revalidatePath("/sites")
  revalidatePath("/")
}

/** Edit a site's core record (name, manager, headcount, capacity). */
export async function editSite(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  if (!id) throw new Error("Missing site id")
  const name = String(formData.get("name") ?? "").trim()
  const location = String(formData.get("location") ?? "").trim()
  const brand = String(formData.get("brand") ?? "").trim() || "Less Than Zero"
  const region = String(formData.get("region") ?? "").trim() || null
  const managerName = String(formData.get("managerName") ?? "").trim() || null
  const headcount = Number(formData.get("headcount") ?? 0) || 0
  const siteType = String(formData.get("siteType") ?? "barbershop").trim()
  const chairCapacity = Number(formData.get("chairCapacity") ?? 0) || 0
  const learnerCapacity = Number(formData.get("learnerCapacity") ?? 0) || 0
  const apprenticeCapacity = Number(formData.get("apprenticeCapacity") ?? 0) || 0
  if (!name || !location) throw new Error("Name and location are required")

  await db
    .update(sites)
    .set({
      name,
      location,
      brand,
      region,
      managerName,
      headcount,
      siteType: siteType === "training" ? "training" : "barbershop",
      chairCapacity,
      learnerCapacity,
      apprenticeCapacity,
    })
    .where(eq(sites.id, id))
  revalidatePath("/sites")
  revalidatePath(`/sites/${id}`)
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

/**
 * Assign an action/risk to an owner (a dashboard user). Owners feed Cosmin's
 * weekly operational meeting register. Passing an empty value clears it.
 */
export async function assignActionOwner(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  if (!id) return
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim() || null

  let ownerName: string | null = null
  if (ownerUserId) {
    const [u] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, ownerUserId))
    ownerName = u?.name ?? null
  }

  await db
    .update(actions)
    .set({
      ownerUserId,
      // Keep the free-text owner in sync with the assigned person's name.
      ...(ownerName ? { owner: ownerName } : {}),
    })
    .where(eq(actions.id, id))
  revalidatePath("/actions")
  revalidatePath("/operations")
  revalidatePath("/")
}

/** Flag/unflag an action as a risk for the weekly operational meeting. */
export async function setActionRisk(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  if (!id) return
  const isRisk = String(formData.get("isRisk")) === "true"
  await db.update(actions).set({ isRisk }).where(eq(actions.id, id))
  revalidatePath("/actions")
  revalidatePath("/operations")
  revalidatePath("/")
}

/**
 * Amend an action's RAG status. Used in the action register and live during
 * the weekly operational meeting — the change writes straight back to the
 * shared action register.
 */
export async function setActionRag(formData: FormData) {
  await requireUser()
  const id = Number(formData.get("id"))
  const rag = String(formData.get("rag"))
  if (!id || !["red", "amber", "green"].includes(rag)) return
  await db.update(actions).set({ rag }).where(eq(actions.id, id))
  revalidatePath("/actions")
  revalidatePath("/operations")
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

  // Persist the confirmed manager/headcount/name back onto the site record so
  // the Sites list and detail page always reflect the latest confirmation
  // (important for sites like F.AF where no barbers enter takings).
  const siteUpdate: Record<string, unknown> = {}
  if (siteNameConfirmed) siteUpdate.name = siteNameConfirmed
  if (locationConfirmed) siteUpdate.location = locationConfirmed
  if (brandConfirmed) siteUpdate.brand = brandConfirmed
  if (managerConfirmed) siteUpdate.managerName = managerConfirmed
  if (headcountConfirmed !== null) siteUpdate.headcount = headcountConfirmed
  if (Object.keys(siteUpdate).length > 0) {
    await db.update(sites).set(siteUpdate).where(eq(sites.id, siteId))
  }

  // On weekly confirmation, sync the capacity (chair utilisation) and
  // Revenue-To-Business (£/barber) red actions for this site.
  await syncCapacityActions(siteId, weekEnding, user.name || user.email)

  revalidatePath("/sites")
  revalidatePath(`/sites/${siteId}`)
  revalidatePath("/actions")
  revalidatePath("/")
}

/** Recompute chair-utilisation and RTB red actions for a site + week. */
async function syncCapacityActions(
  siteId: number,
  weekEnding: string,
  owner: string,
) {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
  if (!site) return

  const [barberAgg] = await db
    .select({ c: sql<number>`count(*)` })
    .from(barbers)
    .where(and(eq(barbers.siteId, siteId), eq(barbers.active, true)))
  const activeBarbers = Number(barberAgg?.c ?? 0)

  // Chair utilisation — barbershops only.
  if ((site.siteType ?? "barbershop") === "barbershop") {
    const capacity = site.chairCapacity ?? 0
    const vacant = Math.max(0, capacity - activeBarbers)
    await syncKpiAction({
      open: capacity > 0 && activeBarbers < capacity,
      title: `Chair capacity underutilised — ${site.name}`,
      functionArea: "Capacity",
      siteId,
      owner,
      description: `${site.name} is running ${activeBarbers} of ${capacity} chairs (${vacant} vacant). Underutilised — recruit or reallocate to fill capacity.`,
    })

    // Revenue To Business — expected = barbers x £/barber, vs rent returned.
    const [rentAgg] = await db
      .select({
        rent: sql<number>`coalesce(sum(${weeklyTakings.cashRent} + ${weeklyTakings.cardRent}), 0)`,
      })
      .from(weeklyTakings)
      .where(
        and(
          eq(weeklyTakings.siteId, siteId),
          eq(weeklyTakings.weekEnding, weekEnding),
        ),
      )
    const rtbActual = Number(rentAgg?.rent ?? 0)
    const perBarber = Number(site.rtbPerBarber ?? 500)
    const expected = activeBarbers * perBarber
    await syncKpiAction({
      open: expected > 0 && rtbActual < expected,
      title: `Revenue-To-Business below target — ${site.name}`,
      functionArea: "RTB",
      siteId,
      owner,
      description: `RTB for W/E ${fmtWeekLong(weekEnding)} was ${fmtGBP(
        rtbActual,
      )} against an expected ${fmtGBP(expected)} (${activeBarbers} barbers x ${fmtGBP(
        perBarber,
      )}). Below the £${perBarber}/barber assumption.`,
    })
  }
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
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
  const siteName = site?.name ?? "Site"
  await syncKpiAction({
    open: amount < target,
    title: `Subletting below target — ${siteName}`,
    functionArea: "Subletting",
    siteId,
    owner: recordedBy,
    description: `Weekly subletting income was below the £${SUBLET_WEEKLY_TARGET} target (W/E ${fmtWeekLong(
      weekEnding,
    )}). Review quarterly and agree corrective action with the site manager.`,
  })

  revalidatePath("/sites")
  revalidatePath(`/sites/${siteId}`)
  revalidatePath("/actions")
  revalidatePath("/")
}

/** Record a training academy's weekly throughput (private learners + apprentices).
 *  Below either weekly capacity is RED and raises a review action. */
export async function saveTrainingWeek(formData: FormData) {
  // Rendered on the weekly data-entry page, so allow any data-entry user
  // (barbers + management) to record academy throughput.
  const user = await requireDataEntry()
  const siteId = Number(formData.get("siteId"))
  const weekEnding = String(formData.get("weekEnding"))
  const privateLearners = Number(formData.get("privateLearners") ?? 0) || 0
  const apprentices = Number(formData.get("apprentices") ?? 0) || 0
  const notes = String(formData.get("notes") ?? "").trim() || null
  if (!siteId || !weekEnding) throw new Error("Missing site or week")

  const recordedBy = user.name || user.email
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId))
  if (!site) throw new Error("Site not found")

  const existing = await db
    .select({ id: trainingWeeks.id })
    .from(trainingWeeks)
    .where(
      and(
        eq(trainingWeeks.siteId, siteId),
        eq(trainingWeeks.weekEnding, weekEnding),
      ),
    )

  const values = { privateLearners, apprentices, recordedBy, notes }
  if (existing.length > 0) {
    await db
      .update(trainingWeeks)
      .set(values)
      .where(eq(trainingWeeks.id, existing[0].id))
  } else {
    await db.insert(trainingWeeks).values({ siteId, weekEnding, ...values })
  }

  const learnerCap = site.learnerCapacity ?? 0
  const apprenticeCap = site.apprenticeCapacity ?? 0
  const below =
    (learnerCap > 0 && privateLearners < learnerCap) ||
    (apprenticeCap > 0 && apprentices < apprenticeCap)

  await syncKpiAction({
    open: below,
    title: `Training below capacity — ${site.name}`,
    functionArea: "Training",
    siteId,
    owner: recordedBy,
    description: `Weekly training throughput was below target (W/E ${fmtWeekLong(
      weekEnding,
    )}): ${privateLearners}/${learnerCap} private learners, ${apprentices}/${apprenticeCap} apprentices. Underutilised — agree a plan to fill capacity.`,
  })

  revalidatePath("/sites")
  revalidatePath(`/sites/${siteId}`)
  revalidatePath("/actions")
  revalidatePath("/")
}
