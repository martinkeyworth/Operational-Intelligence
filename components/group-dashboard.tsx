import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { RagBadge, RagDot } from "@/components/rag"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RevenueTrendChart } from "@/components/revenue-trend-chart"
import { AiCommentary } from "@/components/ai-commentary"
import { WeekSelector } from "@/components/week-selector"
import { fmtGBP, fmtWeekLong } from "@/lib/data"
import type {
  GroupSummary,
  SiteWeekRow,
  TrendPoint,
  BarberWeekRow,
  ActionRow,
} from "@/lib/data"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
} from "lucide-react"

function barFill(rag: "green" | "amber" | "red") {
  return rag === "green"
    ? "bg-rag-green"
    : rag === "amber"
      ? "bg-rag-amber"
      : "bg-rag-red"
}

export function GroupDashboard({
  summary,
  weeks,
  sites,
  trend,
  barbers,
  actions,
}: {
  summary: GroupSummary
  weeks: string[]
  sites: SiteWeekRow[]
  trend: TrendPoint[]
  barbers: BarberWeekRow[]
  actions: ActionRow[]
}) {
  const risks = actions
    .filter((a) => a.status !== "Closed" && (a.rag === "red" || a.escalated))
    .slice(0, 5)
  const reporting = barbers.filter((b) => b.reported)
  const leaderboard = reporting.slice(0, 6)
  const wowUp = summary.wowPct >= 0

  return (
    <div>
      <PageHeader
        meta="Group Executive View"
        title="Operational Intelligence & Governance"
        subtitle="Weekly group performance, RAG status and key risks across all LTZ sites. Saturday-to-Saturday reporting with worst-status roll-up at every level."
      >
        <RagBadge rag={summary.groupRag} className="px-3 py-1 text-sm" />
        <WeekSelector weeks={weeks} current={summary.week} />
      </PageHeader>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label={`Takings · W/E ${fmtWeekLong(summary.week)}`}
            value={fmtGBP(summary.weekRevenue)}
            sub={
              summary.prevWeek ? (
                <span
                  className={
                    wowUp
                      ? "flex items-center gap-1 text-rag-green"
                      : "flex items-center gap-1 text-rag-red"
                  }
                >
                  {wowUp ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {Math.abs(summary.wowPct).toFixed(0)}% vs last week
                </span>
              ) : (
                "First reported week"
              )
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
            label="Reporting Barbers"
            value={`${summary.reportingBarbers}/${summary.activeBarbers}`}
            sub={`${fmtGBP(summary.avgPerBarber)} avg this week`}
          />
          <StatCard
            label="Sites Confirmed"
            value={`${summary.confirmedSites}/${summary.siteCount}`}
            sub={
              summary.confirmedSites < summary.siteCount ? (
                <span className="flex items-center gap-1 text-rag-amber">
                  <Clock className="h-3 w-3" />
                  Awaiting confirmation
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rag-green">
                  <CheckCircle2 className="h-3 w-3" />
                  All confirmed
                </span>
              )
            }
          />
        </div>

        {/* Trend + RAG distribution / commentary */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Group Weekly Takings
              </h2>
              <p className="text-xs text-muted-foreground">
                Total takings per week vs combined target
              </p>
            </div>
            <RevenueTrendChart data={trend} />
          </Card>

          <Card className="flex flex-col p-5">
            <h2 className="text-sm font-semibold text-foreground">
              Site RAG Distribution
            </h2>
            <p className="text-xs text-muted-foreground">Status roll-up by site</p>
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
                        <span>
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
                        className={`h-full rounded-full ${barFill(rag)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-auto pt-5">
              <AiCommentary summary={summary} sites={sites} barbers={barbers} />
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
                Weekly takings vs target, by site
              </p>
            </div>
            <Link
              href="/sites"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              All sites
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {sites.map((s) => (
              <Link
                key={s.id}
                href={`/sites/${s.id}?week=${summary.week}`}
                className="group rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RagDot rag={s.rag} />
                      <p className="truncate text-sm font-medium text-foreground">
                        {s.name}
                      </p>
                      {s.confirmed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-rag-green" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 shrink-0 text-rag-amber" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.siteType === "training"
                        ? `${s.location} · Academy`
                        : `${s.location} · ${s.activeBarbers}/${s.chairCapacity} chairs`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {s.siteType === "training"
                      ? s.trainingRag === "green"
                        ? "On track"
                        : "Below"
                      : `${s.attainmentPct.toFixed(0)}%`}
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${barFill(s.rag)}`}
                    style={{
                      width:
                        s.siteType === "training"
                          ? "100%"
                          : `${Math.min(s.attainmentPct, 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  {s.siteType === "training" ? (
                    <>
                      <span>Training academy</span>
                      <span className="flex items-center gap-1">
                        <RagDot rag={s.trainingRag} />
                        Capacity
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{fmtGBP(s.weekRevenue)}</span>
                      <span className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <RagDot rag={s.utilisationRag} />
                          Chairs
                        </span>
                        <span className="flex items-center gap-1">
                          <RagDot rag={s.rtbRag} />
                          RTB
                        </span>
                      </span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Barber leaderboard + Risks */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Barber Leaderboard
                </h2>
                <p className="text-xs text-muted-foreground">
                  Top performers this week, group-wide
                </p>
              </div>
            </div>
            {leaderboard.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No takings reported for this week yet.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {leaderboard.map((b, i) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="w-5 text-center text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <RagDot rag={b.rag} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {b.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.role} · {b.siteName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {fmtGBP(b.revenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.attainmentPct.toFixed(0)}% of target
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                          <AlertTriangle className="h-3 w-3" />
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
      </div>
    </div>
  )
}
