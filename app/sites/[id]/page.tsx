import { notFound } from "next/navigation"
import Link from "next/link"
import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RagBadge, RagDot } from "@/components/rag"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmSiteDialog } from "@/components/confirm-site-dialog"
import { EditSiteInfoDialog } from "@/components/edit-site-info-dialog"
import { SubletCard } from "@/components/sublet-card"
import { CapacityCard } from "@/components/capacity-card"
import { TrainingCard } from "@/components/training-card"
import { WeekSelector } from "@/components/week-selector"
import {
  getWeeks,
  getLatestWeek,
  getSite,
  getSiteWeek,
  getBarberWeek,
  getSubletForSiteWeek,
  getSubletHistory,
  getCapacityKpis,
  fmtGBP,
  fmtWeekLong,
} from "@/lib/data"
import { ArrowLeft, ArrowDownRight, ArrowUpRight } from "lucide-react"

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireDashboard()

  const { id } = await params
  const siteId = Number(id)
  const site = await getSite(siteId)
  if (!site) notFound()

  const { week: weekParam } = await searchParams
  const weeks = await getWeeks()
  const week =
    weekParam && weeks.includes(weekParam) ? weekParam : await getLatestWeek()

  const siteWeekRows = week ? await getSiteWeek(week) : []
  const siteWeek = siteWeekRows.find((s) => s.id === siteId)
  const barbers = week ? await getBarberWeek(week, siteId) : []
  const reporting = barbers.filter((b) => b.reported)

  // Subletting KPI applies to F.AF sites (Cavendish and any F.AF site).
  const hasSubletting = site.brand === "F.AF"
  const sublet =
    hasSubletting && week ? await getSubletForSiteWeek(siteId, week) : null
  const subletHistory = hasSubletting ? await getSubletHistory(siteId) : []

  // Capacity / RTB / training KPIs.
  const capacity = week ? await getCapacityKpis(siteId, week) : null
  const isTraining = site.siteType === "training"

  return (
    <AppShell user={user}>
      <PageHeader
        meta={
          <Link href="/sites" className="flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Sites
          </Link>
        }
        title={site.name}
        subtitle={`${site.brand} · ${site.location}${site.region ? ` · ${site.region}` : ""} · Manager: ${site.managerName ?? "—"}`}
      >
        {siteWeek && <RagBadge rag={siteWeek.rag} className="px-3 py-1 text-sm" />}
        {week && <WeekSelector weeks={weeks} current={week} />}
        {!isTraining && (
          <EditSiteInfoDialog
            siteId={siteId}
            name={site.name}
            location={site.location}
            brand={site.brand}
            region={site.region}
            managerName={site.managerName}
            siteType={site.siteType}
            headcount={site.headcount}
            chairs={site.chairs}
            chairCapacity={site.chairCapacity}
          />
        )}
        {week && siteWeek && (
          <ConfirmSiteDialog
            siteId={siteId}
            siteName={site.name}
            location={site.location}
            brand={site.brand}
            managerName={site.managerName}
            headcount={siteWeek.headcount}
            week={week}
            confirmed={siteWeek.confirmed}
            confirmedBy={siteWeek.confirmedBy}
          />
        )}
      </PageHeader>

      <div className="space-y-6 px-5 py-6 md:px-8">
        {!week || !siteWeek ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No data for this week.
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label={`Takings · W/E ${fmtWeekLong(week)}`}
                value={fmtGBP(siteWeek.weekRevenue)}
              />
              <StatCard
                label="Target Attainment"
                value={`${siteWeek.attainmentPct.toFixed(0)}%`}
                sub={`Target ${fmtGBP(siteWeek.weekTarget)}`}
              />
              <StatCard
                label="Reporting"
                value={`${siteWeek.reportingBarbers}/${siteWeek.totalBarbers}`}
                sub="barbers this week"
              />
              <StatCard
                label="Avg / barber"
                value={fmtGBP(
                  reporting.length > 0
                    ? siteWeek.weekRevenue / reporting.length
                    : 0,
                )}
              />
            </div>

            {!isTraining && (
              <Card className="p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-foreground">
                    Site info
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Capacity, chairs and barbers — set by the manager
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Capacity</p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {site.chairCapacity}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Chairs</p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {site.chairs}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Barbers</p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {site.headcount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Submitted this week
                    </p>
                    <p
                      className={`text-2xl font-semibold tabular-nums ${
                        site.headcount > 0 &&
                        siteWeek.reportingBarbers >= site.headcount
                          ? "text-rag-green"
                          : "text-rag-amber"
                      }`}
                    >
                      {siteWeek.reportingBarbers}/{site.headcount}
                    </p>
                  </div>
                </div>
                {site.headcount === 0 && (
                  <p className="mt-3 text-xs text-rag-amber">
                    Number of barbers not set — update Site info so the weekly
                    tally can track submissions.
                  </p>
                )}
              </Card>
            )}

            {capacity && isTraining && (
              <TrainingCard week={week} kpis={capacity} />
            )}

            {capacity && !isTraining && (
              <CapacityCard week={week} kpis={capacity} />
            )}

            {sublet && (
              <SubletCard sublet={sublet} history={subletHistory} />
            )}

            <Card className="p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Weekly Takings Register
                </h2>
                <p className="text-xs text-muted-foreground">
                  Per-barber takings for week ending {fmtWeekLong(week)}
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Barber</TableHead>
                      <TableHead className="text-right">Cash</TableHead>
                      <TableHead className="text-right">Card</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">vs Target</TableHead>
                      <TableHead className="text-right">WoW</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {barbers.map((b) => {
                      const wow =
                        b.prevRevenue > 0
                          ? ((b.revenue - b.prevRevenue) / b.prevRevenue) * 100
                          : null
                      return (
                        <TableRow key={b.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <RagDot rag={b.rag} />
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {b.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {b.role}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                            {b.reported ? fmtGBP(b.cash) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                            {b.reported ? fmtGBP(b.card) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                            {b.reported ? fmtGBP(b.revenue) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                            {b.reported ? `${b.attainmentPct.toFixed(0)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {wow === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span
                                className={
                                  wow >= 0
                                    ? "inline-flex items-center gap-0.5 text-rag-green"
                                    : "inline-flex items-center gap-0.5 text-rag-red"
                                }
                              >
                                {wow >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {Math.abs(wow).toFixed(0)}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {b.reported ? (
                              <RagBadge rag={b.rag} />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not reported
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {barbers.some((b) => b.reported && b.comments) && (
                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Manager comments
                  </p>
                  {barbers
                    .filter((b) => b.reported && b.comments)
                    .map((b) => (
                      <p key={b.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {b.name}:
                        </span>{" "}
                        {b.comments}
                        {b.manager ? ` (${b.manager})` : ""}
                      </p>
                    ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}
