import { requireDataEntry } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { WeekSelector } from "@/components/week-selector"
import { BarberEntryCard } from "@/components/barber-entry-card"
import { getEntryWeeks, getDataEntrySites, getSiteOptions, fmtWeekLong } from "@/lib/data"

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
      </div>
    </AppShell>
  )
}
