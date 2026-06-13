"use server"

import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { kpis, kpiValues } from "@/lib/db/schema"
import { requireUser, canInputArea } from "@/lib/access"
import { findKpi, scoreKpi, kpisForBrand, isPerBrandArea } from "@/lib/kpi-config"

/**
 * Save a single weekly functional-area KPI value (HR / Marketing). Scores it
 * RAG against its thresholds and upserts one row per KPI per week. Restricted
 * to the lead of that KPI's functional area (owners may input any area).
 *
 * For per-brand areas (Marketing & Social) an optional `brand` is captured so
 * each brand stores its own row, and the spend KPI is scored against the
 * per-brand budget rather than the whole-group budget.
 */
export async function saveKpiValue(formData: FormData) {
  const code = String(formData.get("code") ?? "")
  const week = String(formData.get("week") ?? "")
  const raw = formData.get("value")
  const commentary = String(formData.get("commentary") ?? "").trim() || null
  const brand = String(formData.get("brand") ?? "").trim() || null

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

  // For per-brand areas, score against the brand-scaled thresholds so e.g.
  // marketing spend is judged against one brand's budget.
  const scoringDef =
    brand && isPerBrandArea(def.functionArea)
      ? kpisForBrand(def.functionArea).find((d) => d.code === code) ?? def
      : def
  const rag = scoreKpi(scoringDef, value)

  // Resolve the catalogue id for this code.
  const [kpi] = await db.select({ id: kpis.id }).from(kpis).where(eq(kpis.code, code))
  if (!kpi) throw new Error("KPI not seeded")

  const existing = await db
    .select({ id: kpiValues.id })
    .from(kpiValues)
    .where(
      and(
        eq(kpiValues.kpiId, kpi.id),
        eq(kpiValues.period, week),
        brand ? eq(kpiValues.brand, brand) : isNull(kpiValues.brand),
      ),
    )

  const row = {
    value: String(value),
    rag,
    commentary,
  }

  if (existing.length > 0) {
    await db.update(kpiValues).set(row).where(eq(kpiValues.id, existing[0].id))
  } else {
    await db
      .insert(kpiValues)
      .values({ kpiId: kpi.id, period: week, brand, ...row })
  }

  // KPI values surface on the dashboard, the function areas and reports.
  // Revalidate the whole tree so every dependent view updates consistently.
  revalidatePath("/", "layout")
}
