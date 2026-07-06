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
  getManualKpiResults,
  getMarketingResultsBySite,
  getTrainingSitesForWeek,
  fmtWeekLong,
} from "@/lib/data"
import { findFunctionArea } from "@/lib/function-areas"
import { kpisForArea, isPerSiteArea } from "@/lib/kpi-config"
import { ArrowLeft } from "lucide-react"

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
  const week = weekParam && weeks.includes(weekParam) ? weekParam : weeks[0]

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
