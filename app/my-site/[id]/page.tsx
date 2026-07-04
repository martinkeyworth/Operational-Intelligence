import { redirect, notFound } from "next/navigation"
import { requireUser, canManageSite } from "@/lib/access"
import { SignOutButton } from "@/components/sign-out-button"
import { Card } from "@/components/ui/card"
import { StatCard } from "@/components/ui-bits"
import { RagBadge } from "@/components/rag"
import { ConfirmSiteDialog } from "@/components/confirm-site-dialog"
import { SubletCard } from "@/components/sublet-card"
import { TrainingCard } from "@/components/training-card"
import { WeekSelector } from "@/components/week-selector"
import { CheckCircle2 } from "lucide-react"
import {
  getSelectableWeeks,
  getDefaultWeek,
  getSite,
  getSiteWeek,
  getSubletForSiteWeek,
  getSubletHistory,
  getCapacityKpis,
  getTrainingConfirmation,
  fmtGBP,
  fmtWeekLong,
} from "@/lib/data"

// A lightweight, single-site page for managers who don't have (and shouldn't
// have) full group-dashboard access. It shows ONLY the one site they run — the
// week's takings summary plus the actions they're responsible for (weekly
// confirmation, subletting, training throughput). No group data, no other
// sites, no leadership navigation.
export default async function MySitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const siteId = Number(id)
  if (!siteId) notFound()
  if (!(await canManageSite(user, siteId))) redirect("/no-access")

  const site = await getSite(siteId)
  if (!site) notFound()

  const { week: weekParam } = await searchParams
  const weeks = await getSelectableWeeks()
  const week =
    weekParam && weeks.includes(weekParam) ? weekParam : await getDefaultWeek()

  const siteWeekRows = week ? await getSiteWeek(week) : []
  const siteWeek = siteWeekRows.find((s) => s.id === siteId)

  const hasSubletting = site.brand === "F.AF"
  const sublet =
    hasSubletting && week ? await getSubletForSiteWeek(siteId, week) : null
  const subletHistory = hasSubletting ? await getSubletHistory(siteId) : []

  const isTraining = site.siteType === "training"
  const capacity = week ? await getCapacityKpis(siteId, week) : null
  const trainingConfirm =
    isTraining && week
      ? await getTrainingConfirmation(siteId, week)
      : { entered: false, confirmed: false, confirmedBy: null }

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Less Than Zero · My Site
            </p>
            <SignOutButton />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-balance text-lg font-semibold text-foreground">
                {site.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                {site.brand}
                {site.location ? ` · ${site.location}` : ""} · Manager:{" "}
                {site.managerName ?? "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {siteWeek && <RagBadge rag={siteWeek.rag} className="px-3 py-1" />}
              {week && <WeekSelector weeks={weeks} current={week} />}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-5 px-5 py-6">
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Hi {user.name.split(" ")[0]} — please review this week&apos;s figures
          for {site.name} and confirm the week below. Only your site is shown
          here.
        </p>

        {!week || !siteWeek ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No data for this week yet.
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
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
                label="Barbers reporting"
                value={`${siteWeek.reportingBarbers}/${siteWeek.totalBarbers}`}
                sub="submitted this week"
              />
              <StatCard
                label="Week status"
                value={siteWeek.confirmed ? "Confirmed" : "Awaiting confirmation"}
              />
            </div>

            {/* Weekly confirmation — the primary action for this page. */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Weekly confirmation
                </h2>
              </div>
              {siteWeek.confirmed ? (
                <p className="mb-4 flex items-center gap-1.5 rounded-md border border-rag-green/30 bg-rag-green/5 px-3 py-2 text-xs text-rag-green">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Confirmed for W/E {fmtWeekLong(week)}
                  {siteWeek.confirmedBy ? ` by ${siteWeek.confirmedBy}` : ""}.
                </p>
              ) : (
                <p className="mb-4 rounded-md border border-rag-amber/40 bg-rag-amber/10 px-3 py-2 text-xs text-rag-amber-foreground">
                  This week is <strong>not yet confirmed</strong>. Check the
                  details are correct, then confirm.
                </p>
              )}
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
            </Card>

            {capacity && isTraining && (
              <TrainingCard
                week={week}
                kpis={capacity}
                entered={trainingConfirm.entered}
                confirmed={trainingConfirm.confirmed}
                confirmedBy={trainingConfirm.confirmedBy}
              />
            )}

            {sublet && <SubletCard sublet={sublet} history={subletHistory} />}
          </>
        )}
      </div>
    </main>
  )
}
