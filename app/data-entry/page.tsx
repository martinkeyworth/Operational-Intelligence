import { requireDataEntry, canInputArea } from "@/lib/access"
import { ensureBarberForUser } from "@/lib/team"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { WeekSelector } from "@/components/week-selector"
import { BarberEntryCard } from "@/components/barber-entry-card"
import { TrainingCard } from "@/components/training-card"
import {
  getEntryWeeks,
  getDefaultWeek,
  getDataEntrySites,
  getSiteOptions,
  getTrainingSitesForWeek,
  fmtWeekLong,
} from "@/lib/data"
import { FUNCTION_AREAS } from "@/lib/function-areas"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

export default async function DataEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireDataEntry()

  // A barber who can't view the dashboard is restricted to their own entry
  // card — they must never see colleagues' takings. Managers/dashboard users
  // keep the full multi-barber, multi-site view.
  const isManager = user.canViewDashboard
  // Non-manager barbers are auto-linked (or self-provisioned) to a barber
  // record on first visit so they can submit straight away — no admin step.
  const linkedBarber = isManager ? null : await ensureBarberForUser(user)
  const ownScope = !isManager

  const { week: weekParam } = await searchParams
  const weeks = await getEntryWeeks()
  // Default to the canonical current reporting week (same week the dashboard,
  // site views and a barber's Team Area use) so submissions land on this week.
  const defaultWeek = await getDefaultWeek()
  const week =
    weekParam && weeks.includes(weekParam)
      ? weekParam
      : weeks.includes(defaultWeek)
        ? defaultWeek
        : weeks[0]

  const sites =
    week && (!ownScope || linkedBarber)
      ? await getDataEntrySites(week, linkedBarber?.id)
      : []
  const siteOptions = await getSiteOptions()
  // Only managers see the training-academy input section.
  const trainingSites = week && isManager ? await getTrainingSitesForWeek(week) : []
  // Training academies have their own input card; keep them out of the
  // per-barber takings list.
  const trainingIds = new Set(trainingSites.map((t) => t.id))
  const barberSites = sites.filter((s) => !trainingIds.has(s.id))

  // Quick links to the functional-area input pages this user leads (HR,
  // Marketing, Training). Owners see all three.
  const myAreas = ["HR", "Marketing", "Training"]
    .map((key) => FUNCTION_AREAS.find((a) => a.key === key))
    .filter((a): a is NonNullable<typeof a> => !!a && canInputArea(user, a.key))

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Weekly Input"
        title="Weekly Takings"
        subtitle={
          ownScope
            ? "Enter your cash and card takings for the selected week, then save."
            : "Enter each barber's cash and card takings for the selected week. Save each barber as you go — entries update live across the group."
        }
      >
        {week && <WeekSelector weeks={weeks} current={week} />}
      </PageHeader>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {myAreas.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Your functional areas
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myAreas.map((a) => (
                <Link
                  key={a.key}
                  href={`/functions/${a.key}/input${week ? `?week=${week}` : ""}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:border-primary"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {a.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Enter weekly KPIs
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {!week ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No weeks available.
          </Card>
        ) : ownScope && !linkedBarber ? (
          <Card className="p-8 text-center text-sm text-muted-foreground text-pretty">
            Your login isn&apos;t linked to a barber record yet. Ask a manager
            to link your account on the Team page before entering takings.
          </Card>
        ) : barberSites.length === 0 && trainingSites.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No active barbers found. Add barbers to a site first.
          </Card>
        ) : (
          barberSites.map((site) => (
            <section key={site.id} id={`site-${site.id}`} className="space-y-3 scroll-mt-24">
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

        {week && trainingSites.length > 0 && (
          <div className="space-y-3 border-t border-border pt-8">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Training Academies
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                Record weekly private learners and apprentices for each academy.
                Below capacity is flagged red and feeds the Training RAG.
              </p>
            </div>
            {trainingSites.map((t) => (
              <section key={t.id} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.name}
                </h3>
                <TrainingCard
                  week={week}
                  kpis={t.kpis}
                  entered={t.entered}
                  confirmed={t.confirmed}
                  confirmedBy={t.confirmedBy}
                />
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
