import { requireDataEntry } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { WeekSelector } from "@/components/week-selector"
import { BarberEntryCard } from "@/components/barber-entry-card"
import { KpiEntryRow } from "@/components/kpi-entry-row"
import {
  getEntryWeeks,
  getDataEntrySites,
  getSiteOptions,
  getManualKpiResults,
  fmtWeekLong,
} from "@/lib/data"
import { kpisForArea } from "@/lib/kpi-config"
import { FUNCTION_AREAS } from "@/lib/function-areas"

export default async function DataEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireDataEntry()

  const { week: weekParam } = await searchParams
  const weeks = await getEntryWeeks()
  const week = weekParam && weeks.includes(weekParam) ? weekParam : weeks[0]

  const sites = week ? await getDataEntrySites(week) : []
  const siteOptions = await getSiteOptions()

  // Functional-area KPI input (HR, Marketing) is for management/dashboard users
  // only — barbers just enter takings.
  const kpiAreas = ["HR", "Marketing"]
  const showKpis = user.canViewDashboard && !!week
  const kpiSections = showKpis
    ? await Promise.all(
        kpiAreas.map(async (areaKey) => {
          const cfg = FUNCTION_AREAS.find((a) => a.key === areaKey)
          const results = await getManualKpiResults(areaKey, week)
          const defs = kpisForArea(areaKey)
          return {
            areaKey,
            label: cfg?.label ?? areaKey,
            defs,
            results,
          }
        }),
      )
    : []

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Weekly Input"
        title="Weekly Takings"
        subtitle="Enter each barber's cash and card takings for the selected week. Save each barber as you go — entries update live across the group."
      >
        {week && <WeekSelector weeks={weeks} current={week} />}
      </PageHeader>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {!week ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No weeks available.
          </Card>
        ) : sites.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No active barbers found. Add barbers to a site first.
          </Card>
        ) : (
          sites.map((site) => (
            <section key={site.id} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  {site.name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {site.barbers.length} barber
                  {site.barbers.length === 1 ? "" : "s"} · W/E{" "}
                  {fmtWeekLong(week)}
                </p>
              </div>
              {site.barbers.length === 0 ? (
                <Card className="p-5 text-center text-xs text-muted-foreground">
                  No barbers at this site yet.
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {site.barbers.map((b) => (
                    <BarberEntryCard
                      key={b.id}
                      barber={b}
                      week={week}
                      siteOptions={siteOptions}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        )}

        {showKpis && week && (
          <div className="space-y-8 border-t border-border pt-8">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Functional Area KPIs
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                Weekly People/HR and Marketing measures. Each is scored RAG
                against its target and feeds the overall business RAG on the
                dashboard.
              </p>
            </div>
            {kpiSections.map((section) => (
              <section key={section.areaKey} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h3>
                <div className="flex flex-col gap-3">
                  {section.defs.map((def) => {
                    const r = section.results.find((x) => x.code === def.code)
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
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
