"use server"

import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { kpis, kpiValues, trainingWeeks } from "@/lib/db/schema"
import { requireUser, canInputArea, canManageSite } from "@/lib/access"
import {
  findKpi,
  scoreKpi,
  effectiveKpiDef,
  marketingKpisForSite,
  isPerSiteArea,
} from "@/lib/kpi-config"
import { getSite } from "@/lib/data"

/**
 * Save a single weekly functional-area KPI value.
 *
 * Marketing/social is scored PER SITE (site managers enter their own site's
 * posts + ratings, resolved from the site's brand). HR and Training KPIs are
 * group-level (no site). Training's free-haircut target scales with that week's
 * learner count, so scoring matches what the entry screen shows.
 */
export async function saveKpiValue(formData: FormData) {
  const code = String(formData.get("code") ?? "")
  const week = String(formData.get("week") ?? "")
  const raw = formData.get("value")
  const commentary = String(formData.get("commentary") ?? "").trim() || null
  const siteIdRaw = String(formData.get("siteId") ?? "").trim()
  const siteId = siteIdRaw ? Number(siteIdRaw) : null

  const def = findKpi(code)
  if (!def || !week) throw new Error("Unknown KPI or week")

  const user = await requireUser()

  const perSite = isPerSiteArea(def.functionArea)

  // Authorise: per-site marketing values require access to that site; group
  // KPIs require the functional-area lead (or an owner).
  if (perSite) {
    if (!siteId) throw new Error("Missing site for per-site KPI")
    if (!(await canManageSite(user, siteId)) && !canInputArea(user, def.functionArea)) {
      throw new Error("Not authorised to input this site")
    }
  } else if (!canInputArea(user, def.functionArea)) {
    throw new Error("Not authorised to input this area")
  }

  if (raw === null || String(raw).trim() === "") return

  const value = Number(raw)
  if (Number.isNaN(value)) throw new Error("Invalid KPI value")

  // Resolve the scoring def so the stored RAG matches the entry screen.
  let scoringDef = def
  if (perSite && siteId) {
    // Per-site marketing: use the site's brand-resolved def (post target +
    // rating bands).
    const site = await getSite(siteId)
    if (site) {
      const siteDefs = marketingKpisForSite({
        brand: site.brand,
        siteType: site.siteType,
      })
      scoringDef = siteDefs.find((d) => d.code === code) ?? def
    }
  } else if (code === "trn_free_haircuts") {
    // Group-level Training KPI with a dynamic target of 3 per learner
    // (apprentice + private) across the academy sites this week.
    const trainRows = await db
      .select({
        priv: trainingWeeks.privateLearners,
        app: trainingWeeks.apprentices,
      })
      .from(trainingWeeks)
      .where(eq(trainingWeeks.weekEnding, week))
    const learners = trainRows.reduce((a, r) => a + r.priv + r.app, 0)
    scoringDef = effectiveKpiDef(def, learners)
  }
  const rag = scoreKpi(scoringDef, value)

  const [kpi] = await db.select({ id: kpis.id }).from(kpis).where(eq(kpis.code, code))
  if (!kpi) throw new Error("KPI not seeded")

  const existing = await db
    .select({ id: kpiValues.id })
    .from(kpiValues)
    .where(
      and(
        eq(kpiValues.kpiId, kpi.id),
        eq(kpiValues.period, week),
        siteId ? eq(kpiValues.siteId, siteId) : isNull(kpiValues.siteId),
      ),
    )

  const row = { value: String(value), rag, commentary }

  if (existing.length > 0) {
    await db.update(kpiValues).set(row).where(eq(kpiValues.id, existing[0].id))
  } else {
    await db.insert(kpiValues).values({ kpiId: kpi.id, period: week, siteId, ...row })
  }

  revalidatePath("/", "layout")
}
