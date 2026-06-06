import { notFound } from "next/navigation"
import Link from "next/link"
import { requireDashboard, canInputArea } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { ActionsTable } from "@/components/actions-table"
import { KpiScorecard } from "@/components/kpi-scorecard"
import { RagBadge } from "@/components/rag"
import {
  getFunctionAreaActions,
  getAssignableOwners,
  getManualKpiResults,
  getLatestWeek,
  fmtWeekLong,
} from "@/lib/data"
import { findFunctionArea } from "@/lib/function-areas"
import { kpisForArea } from "@/lib/kpi-config"
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
  const [actions, owners, kpis] = await Promise.all([
    getFunctionAreaActions(area.key),
    getAssignableOwners(),
    hasKpis && week
      ? getManualKpiResults(area.key, week)
      : Promise.resolve([]),
  ])

  const open = actions.filter((a) => a.status !== "Closed")
  const red = open.filter((a) => a.rag === "red").length
  const amber = open.filter((a) => a.rag === "amber").length
  const rag = red > 0 ? "red" : amber > 0 ? "amber" : "green"

  // Areas with a dedicated, lead-owned weekly input page.
  const INPUT_AREAS = ["HR", "Marketing", "Training"]
  const canInput = INPUT_AREAS.includes(area.key) && canInputArea(user, area.key)

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
            {kpis.length > 0 ? (
              <KpiScorecard kpis={kpis} />
            ) : (
              <p className="rounded-lg border border-border p-4 text-xs text-muted-foreground">
                No KPI data yet. Enter this area&apos;s weekly KPIs in the
                Weekly Input page.
              </p>
            )}
          </div>
        )}

        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {area.label} Actions
          </h2>
          <ActionsTable actions={actions} owners={owners} />
        </div>
      </div>
    </AppShell>
  )
}
