"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { kpis, kpiValues } from "@/lib/db/schema"
import { requireUser, canInputArea } from "@/lib/access"
import { findKpi, scoreKpi } from "@/lib/kpi-config"

/**
 * Save a single weekly functional-area KPI value (HR / Marketing). Scores it
 * RAG against its thresholds and upserts one row per KPI per week. Restricted
 * to the lead of that KPI's functional area (owners may input any area).
 */
export async function saveKpiValue(formData: FormData) {
  const code = String(formData.get("code") ?? "")
  const week = String(formData.get("week") ?? "")
  const raw = formData.get("value")
  const commentary = String(formData.get("commentary") ?? "").trim() || null

  const def = findKpi(code)
  if (!def || !week) throw new Error("Unknown KPI or week")

  // Authorise against the KPI's functional area, not just "has a dashboard".
  const user = await requireUser()
  if (!canInputArea(user, def.functionArea)) {
    throw new Error("Not authorised to input this area")
  }

  if (raw === null || String(raw).trim() === "") return

  const value = Number(raw)
  if (Number.isNaN(value)) throw new Error("Invalid KPI value")

  const rag = scoreKpi(def, value)

  // Resolve the catalogue id for this code.
  const [kpi] = await db.select({ id: kpis.id }).from(kpis).where(eq(kpis.code, code))
  if (!kpi) throw new Error("KPI not seeded")

  const existing = await db
    .select({ id: kpiValues.id })
    .from(kpiValues)
    .where(and(eq(kpiValues.kpiId, kpi.id), eq(kpiValues.period, week)))

  const row = {
    value: String(value),
    rag,
    commentary,
  }

  if (existing.length > 0) {
    await db.update(kpiValues).set(row).where(eq(kpiValues.id, existing[0].id))
  } else {
    await db.insert(kpiValues).values({ kpiId: kpi.id, period: week, ...row })
  }

  revalidatePath("/data-entry")
  revalidatePath("/functions")
  revalidatePath(`/functions/${def.functionArea}`)
  revalidatePath("/")
}
