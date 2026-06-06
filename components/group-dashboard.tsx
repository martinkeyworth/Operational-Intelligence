import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { RagBadge, RagDot } from "@/components/rag"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RevenueTrendChart } from "@/components/revenue-trend-chart"
import { AiCommentary } from "@/components/ai-commentary"
import type {
  GroupSummary,
  SiteRow,
  RevenueTrendPoint,
  KpiScorecard,
  DepartmentRow,
  ActionRow,
} from "@/lib/data"
import { AlertTriangle, ArrowRight, TrendingUp } from "lucide-react"

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
})

function fmtKpi(value: number, unit: string) {
  if (unit === "GBP") return GBP.format(value)
  if (unit === "%") return `${value.toFixed(0)}%`
  if (unit === "/5") return `${value.toFixed(1)}/5`
  return value.toFixed(1)
}

export function GroupDashboard({
  summary,
  sites,
  trend,
  scorecards,
  departments,
  actions,
}: {
  summary: GroupSummary
  sites: SiteRow[]
  trend: RevenueTrendPoint[]
  scorecards: KpiScorecard[]
  departments: DepartmentRow[]
  actions: ActionRow[]
}) {
  const period = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  })
  const risks = actions
    .filter((a) => a.status !== "Closed" && (a.rag === "red" || a.escalated))
    .slice(0, 5)

  return (
    <div>
      <PageHeader
        meta="Group Executive View"
        title="Operational Intelligence & Governance"
        subtitle="Weekly group performance, RAG status and key risks across all LTZ sites. Worst-status roll-up applied at every level."
      >
        <RagBadge rag={summary.groupRag} className="px-3 py-1 text-sm" />
      </PageHeader>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label={`Revenue · ${period}`}
            value={GBP.format(summary.monthRevenue)}
            sub={
              <span className="flex items-center gap-1 text-rag-green">
                <TrendingUp className="h-3 w-3" />
                {summary.attainmentPct.toFixed(0)}% of{" "}
                {GBP.format(summary.monthTarget)} target
              </span>
            }
          />
          <StatCard
            label="Target Attainment"
            value={`${summary.attainmentPct.toFixed(0)}%`}
            sub={
              <Progress
                value={Math.min(summary.attainmentPct, 100)}
                className="mt-2 h-1.5"
              />
            }
          />
          <StatCard
            label="Active Barbers"
            value={summary.activeBarbers}
            sub={`Across ${summary.siteCount} sites · ${GBP.format(
              summary.avgRevPerBarberDay,
            )} avg / day`}
          />
          <StatCard
            label="Open Actions"
            value={summary.openActions}
            sub={
              summary.escalatedActions > 0 ? (
                <span className="flex items-center gap-1 text-rag-red">
                  <AlertTriangle className="h-3 w-3" />
                  {summary.escalatedActions} escalated to CEO
                </span>
              ) : (
                "No escalations"
              )
            }
          />
        </div>

        {/* Revenue trend + RAG distribution */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Group Revenue Trend
                </h2>
                <p className="text-xs text-muted-foreground">
                  Daily group revenue, last 30 days
                </p>
              </div>
            </div>
            <RevenueTrendChart data={trend} />
          </Card>

          <Card className="flex flex-col p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Site RAG Distribution
            </h2>
            <p className="text-xs text-muted-foreground">
              Status roll-up by site
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {(["green", "amber", "red"] as const).map((rag) => {
                const count = summary.ragCounts[rag]
                const pct =
                  summary.siteCount > 0 ? (count / summary.siteCount) * 100 : 0
                return (
                  <div key={rag} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-foreground">
                        <RagDot rag={rag} />
                        <span className="capitalize">
                          {rag === "green"
                            ? "On track"
                            : rag === "amber"
                              ? "At risk"
                              : "Critical"}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {count} site{count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={
                          rag === "green"
                            ? "h-full rounded-full bg-rag-green"
                            : rag === "amber"
                              ? "h-full rounded-full bg-rag-amber"
                              : "h-full rounded-full bg-rag-red"
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-auto pt-5">
              <AiCommentary summary={summary} sites={sites} risks={risks} />
            </div>
          </Card>
        </div>

        {/* Site performance */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Site Performance
              </h2>
              <p className="text-xs text-muted-foreground">
                Month-to-date revenue vs target, by site
              </p>
            </div>
            <Link
              href="/sites"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all sites
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {sites.map((s) => (
              <Link
                key={s.id}
                href={`/sites/${s.id}`}
                className="group rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RagDot rag={s.rag} />
                      <p className="truncate text-sm font-medium text-foreground">
                        {s.name}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.location} · {s.activeBarbers} barbers ·{" "}
                      {s.managerName}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {s.attainmentPct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      s.rag === "green"
                        ? "h-full rounded-full bg-rag-green"
                        : s.rag === "amber"
                          ? "h-full rounded-full bg-rag-amber"
                          : "h-full rounded-full bg-rag-red"
                    }
                    style={{ width: `${Math.min(s.attainmentPct, 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{GBP.format(s.monthRevenue)}</span>
                  <span>Target {GBP.format(s.monthlyTarget)}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Departments + Risks */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Functional Governance
            </h2>
            <p className="text-xs text-muted-foreground">
              Department RAG roll-up across KPIs and actions
            </p>
            <div className="mt-4 flex flex-col divide-y divide-border">
              {departments.map((d) => (
                <div
                  key={d.functionArea}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <RagDot rag={d.rag} />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {d.functionArea}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.kpiCount} KPI{d.kpiCount === 1 ? "" : "s"} ·{" "}
                        {d.openActions} open action
                        {d.openActions === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <RagBadge rag={d.rag} />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Key Risks & Escalations
                </h2>
                <p className="text-xs text-muted-foreground">
                  Critical and escalated items requiring attention
                </p>
              </div>
              <Link
                href="/actions"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Register
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {risks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No critical risks. All clear.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {risks.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {r.title}
                      </p>
                      {r.escalated && (
                        <span className="shrink-0 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                          Escalated
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.functionArea}
                      {r.siteName ? ` · ${r.siteName}` : " · Group"} · Owner:{" "}
                      {r.owner}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* KPI scorecard */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Group KPI Scorecard
              </h2>
              <p className="text-xs text-muted-foreground">
                Latest reported period, group-level roll-up
              </p>
            </div>
            <Link
              href="/kpis"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              KPI Register
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scorecards.map((k) => (
              <div
                key={k.kpiId}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {k.code} · {k.functionArea}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {k.name}
                    </p>
                  </div>
                  <RagDot rag={k.rag} className="mt-1" />
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  {fmtKpi(k.groupValue, k.unit)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Owner: {k.ownerRole}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
