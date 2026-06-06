import Link from "next/link"
import Image from "next/image"
import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RagDot } from "@/components/rag"
import { Card } from "@/components/ui/card"
import { brandLogo } from "@/lib/brands"
import { AddSiteDialog } from "@/components/add-site-dialog"
import { ConfirmSiteDialog } from "@/components/confirm-site-dialog"
import { WeekSelector } from "@/components/week-selector"
import {
  getWeeks,
  getLatestWeek,
  getSiteWeek,
  fmtGBP,
  fmtWeekLong,
} from "@/lib/data"
import { ArrowRight, CheckCircle2, Clock } from "lucide-react"

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireDashboard()

  const { week: weekParam } = await searchParams
  const weeks = await getWeeks()
  const week =
    weekParam && weeks.includes(weekParam) ? weekParam : await getLatestWeek()

  const sites = week ? await getSiteWeek(week) : []
  const confirmedCount = sites.filter((s) => s.confirmed).length

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Network"
        title="Sites"
        subtitle="All LTZ locations. As the group grows, add new sites here. Each week the functional leader confirms every site's details."
      >
        {week && <WeekSelector weeks={weeks} current={week} />}
        <AddSiteDialog />
      </PageHeader>

      <div className="space-y-6 px-5 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total sites" value={sites.length} />
          <StatCard
            label="Confirmed this week"
            value={`${confirmedCount}/${sites.length}`}
            sub={week ? `W/E ${fmtWeekLong(week)}` : undefined}
          />
          <StatCard
            label="Week takings"
            value={fmtGBP(sites.reduce((a, s) => a + s.weekRevenue, 0))}
          />
          <StatCard
            label="Reporting barbers"
            value={sites.reduce((a, s) => a + s.reportingBarbers, 0)}
          />
        </div>

        {!week ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No reporting weeks yet.
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {sites.map((s) => (
              <Card key={s.id} className="p-4 md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="relative mt-0.5 shrink-0">
                      <Image
                        src={brandLogo(s.brand) || "/placeholder.svg"}
                        alt={`${s.brand} logo`}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-md object-cover"
                      />
                      <RagDot
                        rag={s.rag}
                        className="absolute -right-1 -top-1 ring-2 ring-card"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/sites/${s.id}?week=${week}`}
                          className="text-base font-semibold text-foreground hover:underline"
                        >
                          {s.name}
                        </Link>
                        {s.confirmed ? (
                          <span className="flex items-center gap-1 rounded-full bg-rag-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-green">
                            <CheckCircle2 className="h-3 w-3" />
                            Confirmed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-rag-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-amber">
                            <Clock className="h-3 w-3" />
                            Awaiting
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.brand} · {s.location}
                        {s.region ? ` · ${s.region}` : ""} · Manager:{" "}
                        {s.managerName ?? "—"}
                        {s.confirmed && s.confirmedBy
                          ? ` · Confirmed by ${s.confirmedBy}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {s.siteType === "training"
                          ? "Academy"
                          : fmtGBP(s.weekRevenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.siteType === "training"
                          ? "Training site"
                          : `${s.attainmentPct.toFixed(0)}% · ${s.activeBarbers}/${s.chairCapacity} chairs`}
                      </p>
                    </div>
                    <ConfirmSiteDialog
                      siteId={s.id}
                      siteName={s.name}
                      location={s.location}
                      brand={s.brand}
                      managerName={s.managerName}
                      headcount={s.totalBarbers}
                      week={week}
                      confirmed={s.confirmed}
                      confirmedBy={s.confirmedBy}
                    />
                    <Link
                      href={`/sites/${s.id}?week=${week}`}
                      className="hidden text-muted-foreground hover:text-foreground sm:block"
                      aria-label={`Open ${s.name}`}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
