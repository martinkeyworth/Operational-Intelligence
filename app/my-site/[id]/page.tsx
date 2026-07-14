import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { requireUser, canManageSite } from "@/lib/access"
import { ensureBarberForUser } from "@/lib/team"
import { SignOutButton } from "@/components/sign-out-button"
import { Card } from "@/components/ui/card"
import { StatCard } from "@/components/ui-bits"
import { RagBadge } from "@/components/rag"
import { ConfirmSiteDialog } from "@/components/confirm-site-dialog"
import { getSiteConfirmReview } from "@/lib/site-confirm-review"
import { BarberEntryCard } from "@/components/barber-entry-card"
import { MarketingEntryCard } from "@/components/marketing-entry-card"
import { SubletCard } from "@/components/sublet-card"
import { TrainingCard } from "@/components/training-card"
import { WeekSelector } from "@/components/week-selector"
import { CheckCircle2, ClipboardEdit, CalendarClock, Share2 } from "lucide-react"
import {
  getSelectableWeeks,
  getDefaultWeek,
  getSite,
  getSiteWeek,
  getDataEntrySites,
  getMarketingResultsBySite,
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
  // The current operating week — used to warn if the manager is viewing/entering
  // against a different week than the one in progress.
  const currentWeek = await getDefaultWeek()
  const week =
    weekParam && weeks.includes(weekParam) ? weekParam : currentWeek

  const siteWeekRows = week ? await getSiteWeek(week) : []
  const siteWeek = siteWeekRows.find((s) => s.id === siteId)

  // Computed per-barber RTB + discrepancy flags for the confirm dialog.
  const confirmReview = week
    ? await getSiteConfirmReview(siteId, week)
    : undefined

  // If the manager is also a barber based at this site, let them enter their
  // OWN weekly takings here (scoped to just their record + this one site — no
  // other barbers, no other site names).
  const linkedBarber = user.isBarber ? await ensureBarberForUser(user) : null
  const myEntry =
    week && linkedBarber
      ? (await getDataEntrySites(week, linkedBarber.id))
          .find((s) => s.id === siteId)
          ?.barbers.find((b) => b.id === linkedBarber.id) ?? null
      : null

  const hasSubletting = site.brand === "F.AF"
  const sublet =
    hasSubletting && week ? await getSubletForSiteWeek(siteId, week) : null
  const subletHistory = hasSubletting ? await getSubletHistory(siteId) : []

  const isTraining = site.siteType === "training"
  // Barbershop managers enter their own site's social posts + reviews here.
  const marketingKpis =
    !isTraining && week
      ? (await getMarketingResultsBySite(week)).find((s) => s.siteId === siteId)
          ?.kpis ?? []
      : []
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
            <div className="flex items-center gap-3">
              {user.isBarber && (
                <>
                  <Link
                    href="/team"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Team Area
                  </Link>
                  <Link
                    href="/openings"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Open Roles
                  </Link>
                </>
              )}
              <Link
                href="/approvals"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Approvals
              </Link>
              <SignOutButton />
            </div>
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

        {week && (
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              week === currentWeek
                ? "border-primary/40 bg-primary/10"
                : "border-rag-amber/50 bg-rag-amber/10"
            }`}
          >
            <CalendarClock
              className={`mt-0.5 h-5 w-5 shrink-0 ${
                week === currentWeek ? "text-primary" : "text-rag-amber"
              }`}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {week === currentWeek
                  ? "You are on the current week"
                  : "Heads up — this is not the current week"}
              </p>
              <p className="text-sm text-muted-foreground text-pretty">
                This page is showing{" "}
                <span className="font-medium text-foreground">
                  week ending {fmtWeekLong(week)}
                </span>
                . {week === currentWeek
                  ? "Any figures you enter or confirm apply to this week."
                  : "Use the week selector at the top to switch back to the current week."}
              </p>
            </div>
          </div>
        )}

        {myEntry && week && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardEdit className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                Your weekly takings
              </h2>
            </div>
            <p className="text-pretty text-xs text-muted-foreground">
              Enter your own cash and card takings for this week, then save.
            </p>
            <BarberEntryCard
              barber={myEntry}
              week={week}
              siteOptions={[{ id: siteId, name: site.name }]}
            />
          </section>
        )}

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
                review={confirmReview}
              />
            </Card>

            {!isTraining && marketingKpis.length > 0 && (
              <Card className="p-5">
                <div className="mb-1 flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Social &amp; reviews
                  </h2>
                </div>
                <p className="mb-4 text-pretty text-xs text-muted-foreground">
                  Enter how many posts went out on each platform this week, plus
                  your latest Google and booking ratings. Post 3×/day per
                  platform to stay green. Mario reviews and signs off the week.
                </p>
                <MarketingEntryCard
                  week={week}
                  siteId={siteId}
                  kpis={marketingKpis}
                />
              </Card>
            )}

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
