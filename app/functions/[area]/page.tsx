import { notFound } from "next/navigation"
import Link from "next/link"
import { requireDashboard, canInputArea } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { ActionsTable } from "@/components/actions-table"
import { AreaLog } from "@/components/area-log"
import { KpiScorecard } from "@/components/kpi-scorecard"
import { MarketingConfirmCard } from "@/components/marketing-confirm-card"
import { RagBadge } from "@/components/rag"
import {
  getFunctionAreaActions,
  getAssignableOwners,
  getManualKpiResults,
  getMarketingResultsBySite,
  getMarketingConfirmation,
  getLatestWeek,
  fmtWeekLong,
} from "@/lib/data"
import { findFunctionArea } from "@/lib/function-areas"
import { kpisForArea, isPerSiteArea } from "@/lib/kpi-config"
import { ArrowLeft, PencilLine } from "lucide-react"

export default async function FunctionAreaPage({
  params,
}: {
  params: Promise<{ area: string }>
}) {
  const { area: areaParam } = await params
  const areaKey = decodeURIComponent(areaParam)
  const area = findFunctionArea(areaKey)
  if (!area) notFound()

  const user = await requireDashboard()
  const week = await getLatestWeek()
  const hasKpis = kpisForArea(area.key).length > 0
  const perSite = isPerSiteArea(area.key)
  const isMarketing = area.key === "Marketing"

  const [actions, owners, kpis, siteKpis, hrKpis, trainingKpis, marketingConf] =
    await Promise.all([
      getFunctionAreaActions(area.key),
      getAssignableOwners(),
      hasKpis && !perSite && week
        ? getManualKpiResults(area.key, week)
        : Promise.resolve([]),
      perSite && week
        ? getMarketingResultsBySite(week)
        : Promise.resolve([]),
      // Mario also signs off HR + Training social posts, so surface them here.
      isMarketing && week ? getManualKpiResults("HR", week) : Promise.resolve([]),
      isMarketing && week
        ? getManualKpiResults("Training", week)
        : Promise.resolve([]),
      isMarketing && week
        ? getMarketingConfirmation(week)
        : Promise.resolve(null),
    ])

  const open = actions.filter((a) => a.status !== "Closed")
  const red = open.filter((a) => a.rag === "red").length
  const amber = open.filter((a) => a.rag === "amber").length
  const rag = red > 0 ? "red" : amber > 0 ? "amber" : "green"

  // Areas with a dedicated, lead-owned weekly input page (Marketing is entered
  // per-site by managers, so it is not linked here).
  const INPUT_AREAS = ["HR", "Training"]
  const isLead = canInputArea(user, area.key)
  const canInput = INPUT_AREAS.includes(area.key) && isLead
  // Only HR/Training social posts (group-level) matter for Mario's review.
  const hrPosts = hrKpis.filter((k) => k.code.startsWith("hr_posts_"))
  const trainingPosts = trainingKpis.filter((k) =>
    k.code.startsWith("trn_posts_"),
  )

  return (
    <AppShell user={user}>
      <PageHeader
        meta={`Functional Area · ${area.ownerRole}`}
        title={area.label}
        subtitle={area.description}
      >
        <RagBadge rag={rag} className="px-3 py-1 text-sm" />
        {canInput && (
          <Link
            href={`/functions/${area.key}/input`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <PencilLine className="h-4 w-4" />
            Enter weekly input
          </Link>
        )}
      </PageHeader>
      <div className="space-y-6 px-5 py-6 md:px-8">
        <Link
          href="/functions"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All functional areas
        </Link>

        {isMarketing && week && marketingConf && (
          <MarketingConfirmCard
            week={week}
            confirmed={marketingConf.confirmed}
            confirmedBy={marketingConf.confirmedBy}
            canConfirm={isLead}
          />
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Open Actions" value={open.length} />
          <StatCard label="Critical (Red)" value={red} />
          <StatCard label="At Risk (Amber)" value={amber} />
          <StatCard label="Total Logged" value={actions.length} />
        </div>

        {hasKpis && (
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Weekly KPIs
              </h2>
              {week && (
                <p className="text-xs text-muted-foreground">
                  W/E {fmtWeekLong(week)}
                </p>
              )}
            </div>
            {perSite ? (
              siteKpis.some((s) => s.kpis.some((k) => k.entered)) ? (
                <div className="space-y-5">
                  {siteKpis.map((s) => (
                    <section key={s.siteId} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {s.siteName}
                      </h3>
                      <KpiScorecard kpis={s.kpis} />
                    </section>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-border p-4 text-xs text-muted-foreground">
                  No social data entered yet. Site managers enter their site&apos;s
                  posts and ratings on their site page.
                </p>
              )
            ) : kpis.length > 0 ? (
              <KpiScorecard kpis={kpis} />
            ) : (
              <p className="rounded-lg border border-border p-4 text-xs text-muted-foreground">
                No KPI data yet. Enter this area&apos;s weekly KPIs in the
                Weekly Input page.
              </p>
            )}
          </div>
        )}

        {isMarketing && (hrPosts.length > 0 || trainingPosts.length > 0) && (
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-foreground">
              Function social posts (for sign-off)
            </h2>
            {hrPosts.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  HR — entered by Luke
                </h3>
                <KpiScorecard kpis={hrPosts} />
              </section>
            )}
            {trainingPosts.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Training — entered by Ravi
                </h3>
                <KpiScorecard kpis={trainingPosts} />
              </section>
            )}
          </div>
        )}

        <AreaLog
          areaKey={area.key}
          areaLabel={area.label}
          entries={actions}
          owners={owners}
          canManage={isLead}
        />

        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Full register table
          </summary>
          <div className="mt-3">
            <ActionsTable actions={actions} owners={owners} />
          </div>
        </details>
      </div>
    </AppShell>
  )
}
