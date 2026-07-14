import { notFound } from "next/navigation"
import Link from "next/link"
import { requireAreaLead } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { WeekSelector } from "@/components/week-selector"
import { KpiEntryRow } from "@/components/kpi-entry-row"
import { MarketingEntryCard } from "@/components/marketing-entry-card"
import { TrainingCard } from "@/components/training-card"
import {
  getEntryWeeks,
  getLeadershipDefaultWeek,
  getManualKpiResults,
  getMarketingResultsBySite,
  getTrainingSitesForWeek,
  fmtWeekLong,
} from "@/lib/data"
import { findFunctionArea } from "@/lib/function-areas"
import { kpisForArea, isPerSiteArea } from "@/lib/kpi-config"
import { ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react"

// Functional areas that have a dedicated, lead-owned input page.
const INPUT_AREAS = ["HR", "Marketing", "Training"]

export default async function FunctionAreaInputPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { area: areaParam } = await params
  const areaKey = decodeURIComponent(areaParam)
  const area = findFunctionArea(areaKey)
  if (!area || !INPUT_AREAS.includes(area.key)) notFound()

  // Only the designated lead (or an owner) may open this page.
  const user = await requireAreaLead(area.key)

  const { week: weekParam } = await searchParams
  const weeks = await getEntryWeeks()
  // Default the entry week to the SAME week leadership reviews (most recent
  // completed week) so a lead's weekly figures land on the week everyone is
  // looking at — otherwise entering "this week" saved to the in-progress week
  // and showed as "Not reported" on the overview/Marketing sign-off. The week
  // selector still lets a lead pick the in-progress week when needed.
  const reviewWeek = await getLeadershipDefaultWeek()
  const week =
    weekParam && weeks.includes(weekParam)
      ? weekParam
      : weeks.includes(reviewWeek)
        ? reviewWeek
        : weeks[0]

  const isTraining = area.key === "Training"
  const perSite = isPerSiteArea(area.key)
  const defs = isTraining ? kpisForArea(area.key) : perSite ? [] : kpisForArea(area.key)
  const results =
    !isTraining && !perSite && week
      ? await getManualKpiResults(area.key, week)
      : []
  // Training social + free-haircut KPIs are group-level (one academy team).
  const trainingKpis =
    isTraining && week ? await getManualKpiResults(area.key, week) : []
  const marketingSites =
    perSite && week ? await getMarketingResultsBySite(week) : []
  const trainingSites = isTraining && week ? await getTrainingSitesForWeek(week) : []

  // "Still to enter this week" — a plain list of what this lead hasn't entered
  // yet, so the "enter once and it pulls through" principle is obvious at a
  // glance. Uses each KpiResult's `entered` flag (and throughput `entered`).
  const outstanding: string[] = []
  if (week) {
    if (isTraining) {
      for (const t of trainingSites)
        if (!t.entered) outstanding.push(`${t.name} — throughput`)
      for (const r of trainingKpis)
        if (!r.entered) outstanding.push(r.platform ? `${r.platform} posts` : r.name)
    } else if (perSite) {
      for (const s of marketingSites) {
        const missing = s.kpis.filter((k) => !k.entered).length
        if (missing > 0)
          outstanding.push(
            `${s.siteName} — ${missing} measure${missing === 1 ? "" : "s"}`,
          )
      }
    } else {
      for (const r of results)
        if (!r.entered) outstanding.push(r.platform ? `${r.platform} posts` : r.name)
    }
  }

  return (
    <AppShell user={user}>
      <PageHeader
        meta={`${area.label} · ${area.ownerRole}`}
        title={`${area.label} — Weekly Input`}
        subtitle={`Enter this week's ${area.label} measures. Each is scored RAG and feeds the overall business RAG on the dashboard.`}
      >
        {week && <WeekSelector weeks={weeks} current={week} />}
      </PageHeader>

      <div className="space-y-6 px-5 py-6 md:px-8">
        <Link
          href={`/functions/${area.key}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {area.label}
        </Link>

        {week &&
          (outstanding.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-rag-green/40 bg-rag-green/10 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-rag-green" />
              <p className="text-sm font-medium text-foreground text-pretty">
                All {area.label} measures are in for w/e {fmtWeekLong(week)} —
                nothing outstanding.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-rag-amber/40 bg-rag-amber/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 shrink-0 text-rag-amber" />
                <p className="text-sm font-semibold text-foreground">
                  {outstanding.length} still to enter for w/e{" "}
                  {fmtWeekLong(week)}
                </p>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5 pl-7">
                {outstanding.map((label) => (
                  <li
                    key={label}
                    className="rounded-md bg-rag-amber/15 px-2 py-0.5 text-xs font-medium text-rag-amber"
                  >
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-2 pl-7 text-xs text-muted-foreground text-pretty">
                Enter these once here and they pull through to the group
                overview and sign-off automatically.
              </p>
            </div>
          ))}

        {!week ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No weeks available.
          </Card>
        ) : isTraining ? (
          trainingSites.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No training academies yet. Add a training site on the Sites page.
            </Card>
          ) : (
            <div className="space-y-6">
              <p className="text-xs text-muted-foreground">
                W/E {fmtWeekLong(week)}
              </p>
              {trainingSites.map((t) => (
                <section key={t.id} className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.name} — throughput
                  </h2>
                  <TrainingCard
                    week={week}
                    kpis={t.kpis}
                    entered={t.entered}
                    confirmed={t.confirmed}
                    confirmedBy={t.confirmedBy}
                  />
                </section>
              ))}
              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Academy social & free haircuts
                </h2>
                <p className="text-xs text-muted-foreground text-pretty">
                  One post per platform per day (7/week to be green) plus 3 free
                  haircuts per learner. The free-haircut target scales with this
                  week&apos;s learner count.
                </p>
                <div className="flex flex-col gap-3">
                  {defs.map((def) => {
                    const r = trainingKpis.find((x) => x.code === def.code)
                    return (
                      <KpiEntryRow
                        key={def.code}
                        def={def}
                        week={week}
                        initialValue={r?.value ?? null}
                      />
                    )
                  })}
                </div>
              </section>
            </div>
          )
        ) : perSite ? (
          marketingSites.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No barbershop sites yet.
            </Card>
          ) : (
            <div className="space-y-6">
              <p className="text-xs text-muted-foreground text-pretty">
                W/E {fmtWeekLong(week)} · social posts + ratings are entered per
                site. Site managers enter their own site; the area is only green
                when every site hits every measure.
              </p>
              {marketingSites.map((s) => (
                <section key={s.siteId} className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.siteName}
                    {s.brand ? ` · ${s.brand}` : ""}
                  </h2>
                  <MarketingEntryCard
                    week={week}
                    siteId={s.siteId}
                    kpis={s.kpis}
                  />
                </section>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              W/E {fmtWeekLong(week)}
            </p>
            <div className="flex flex-col gap-3">
              {defs.map((def) => {
                const r = results.find((x) => x.code === def.code)
                return (
                  <KpiEntryRow
                    key={def.code}
                    def={def}
                    week={week}
                    initialValue={r?.value ?? null}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
