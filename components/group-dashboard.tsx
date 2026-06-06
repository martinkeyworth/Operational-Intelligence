import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { RagBadge, RagDot } from "@/components/rag"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RevenueTrendChart } from "@/components/revenue-trend-chart"
import { VisionPanel } from "@/components/vision-panel"
import { AiCommentary } from "@/components/ai-commentary"
import { WeekSelector } from "@/components/week-selector"
import { fmtGBP, fmtWeekLong, ragFromAttainment } from "@/lib/data"
import type {
  GroupSummary,
  SiteWeekRow,
  TrendPoint,
  BarberWeekRow,
  ActionRow,
  BusinessScorecard,
} from "@/lib/data"
import type {
  VisionGlidePath,
  VisionMonthlyPlan,
  ExpansionRecommendation,
} from "@/lib/vision"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Store,
  UserPlus,
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
  scorecard,
  vision,
  monthly,
  expansion,
}: {
  summary: GroupSummary
  weeks: string[]
  sites: SiteWeekRow[]
  trend: TrendPoint[]
  barbers: BarberWeekRow[]
  actions: ActionRow[]
  scorecard: BusinessScorecard
  vision: VisionGlidePath
  monthly: VisionMonthlyPlan
  expansion: ExpansionRecommendation
}) {
  const risks = actions
    .filter((a) => a.status !== "Closed" && (a.rag === "red" || a.escalated))
    .slice(0, 5)
  const reporting = barbers.filter((b) => b.reported)
  const leaderboard = reporting.slice(0, 5)

  // 5x5 plan weekly target: this month's required chair takings spread across
  // the ~4.33 weeks in a month. Compares actual takings to the £5m glide path.
  const weekMonth = new Date(summary.week + "T00:00:00").getMonth() + 1
  const planMonth =
    monthly.months.find((m) => m.month === weekMonth) ?? monthly.months[0]
  const planWeeklyTarget = planMonth
    ? Math.round(planMonth.requiredTakings / (52 / 12))
    : 0
  const planAttainmentPct =
    planWeeklyTarget > 0 ? (summary.weekRevenue / planWeeklyTarget) * 100 : 0
  const planRag = ragFromAttainment(planAttainmentPct)
  const planDelta = summary.weekRevenue - planWeeklyTarget

  // Headcount variance: the site manager's stated headcount vs the number of
  // barbers who actually submitted takings this week. Any discrepancy is a
  // manager action to chase the missing reporters (or correct the headcount).
  const headcountVariances = sites
    .filter((s) => s.siteType !== "training" && s.headcount > 0)
    .map((s) => ({
      site: s.name,
      manager: s.managerName,
      headcount: s.headcount,
      reported: s.reportingBarbers,
      variance: s.headcount - s.reportingBarbers,
    }))
    .filter((v) => v.variance !== 0)
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))

  // Recruitment trigger: a barber running at >=95% of their weekly yield
  // target is effectively at capacity. The site manager and HR should be
  // actioned to recruit before the barber maxes out and growth stalls.
  const RECRUIT_YIELD_THRESHOLD = 95
  const managerBySite = new Map(sites.map((s) => [s.name, s.managerName]))
  const recruitTriggers = barbers
    .filter((b) => b.reported && b.attainmentPct >= RECRUIT_YIELD_THRESHOLD)
    .map((b) => ({
      barber: b.name,
      site: b.siteName,
      manager: managerBySite.get(b.siteName) ?? null,
      yieldPct: Math.round(b.attainmentPct),
    }))
    .sort((a, b) => b.yieldPct - a.yieldPct)

  // Capacity recruitment trigger: when AVERAGE chair utilisation across the
  // barbershops is above 90%, the estate is effectively full. HR is actioned
  // to recruit the variance between barbers on headcount and total chair
  // capacity (the vacant chairs) to unlock growth.
  const CAPACITY_UTIL_THRESHOLD = 90
  const capacityShops = sites.filter(
    (s) => s.siteType !== "training" && s.chairCapacity > 0,
  )
  const totalCapacityChairs = capacityShops.reduce(
    (a, s) => a + s.chairCapacity,
    0,
  )
  const totalStaffedChairs = capacityShops.reduce(
    (a, s) => a + Math.min(s.headcount, s.chairCapacity),
    0,
  )
  const avgUtilisationPct =
    totalCapacityChairs > 0
      ? (totalStaffedChairs / totalCapacityChairs) * 100
      : 0
  const vacantChairs = Math.max(0, totalCapacityChairs - totalStaffedChairs)
  const capacityRecruit = {
    triggered: avgUtilisationPct > CAPACITY_UTIL_THRESHOLD && vacantChairs > 0,
    avgUtilisationPct: Math.round(avgUtilisationPct),
    vacantChairs,
    totalCapacityChairs,
    totalStaffedChairs,
  }

  return (
    <div>
      <PageHeader
        meta="Group Executive View"
        title="Operational Intelligence & Governance"
        subtitle="Weekly group performance, RAG status and key risks across all LTZ sites. Saturday-to-Saturday reporting with worst-status roll-up at every level."
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Business RAG · {scorecard.overallPct}%
          </span>
          <RagBadge rag={scorecard.overallRag} className="px-3 py-1 text-sm" />
        </div>
        <WeekSelector weeks={weeks} current={summary.week} />
      </PageHeader>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label={`Takings · W/E ${fmtWeekLong(summary.week)}`}
            value={fmtGBP(summary.weekRevenue)}
            sub={
              planWeeklyTarget > 0 ? (
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <RagBadge rag={planRag} />
                    <span
                      className={
                        planRag === "green"
                          ? "text-rag-green"
                          : planRag === "amber"
                            ? "text-rag-amber"
                            : "text-rag-red"
                      }
                    >
                      {planDelta >= 0 ? "+" : "-"}
                      {fmtGBP(Math.abs(planDelta))} vs 5×5 plan
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Target {fmtGBP(planWeeklyTarget)} ·{" "}
                    {planAttainmentPct.toFixed(0)}%
                  </span>
                </span>
              ) : (
                "No 5×5 target set"
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
            label="Chair Capacity"
            value={
              <span
                className={
                  summary.capacityRag === "green"
                    ? "text-rag-green"
                    : summary.capacityRag === "amber"
                      ? "text-rag-amber"
                      : "text-rag-red"
                }
              >
                {summary.totalHeadcount}/{summary.totalCapacity}
              </span>
            }
            sub={
              <span className="flex items-center gap-2">
                <RagBadge rag={summary.capacityRag} />
                {summary.totalCapacity > 0
                  ? `${Math.round(
                      (summary.totalHeadcount / summary.totalCapacity) * 100,
                    )}% staffed`
                  : "No chairs"}
              </span>
            }
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

        {/* Business scorecard — every functional area scored & rolled up */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Business Scorecard
              </h2>
              <p className="text-xs text-muted-foreground">
                Weighted RAG across all six functional areas
              </p>
            </div>
            <Link
              href="/functions"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Functions
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {scorecard.areas.map((a) => (
              <Link
                key={a.key}
                href={`/functions/${encodeURIComponent(a.key)}`}
                className="group rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <RagDot rag={a.rag} />
                    <span className="truncate">{a.label}</span>
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                  {a.pct}%
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${barFill(a.rag)}`}
                    style={{ width: `${Math.max(4, Math.min(100, a.pct))}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Trend + RAG distribution / commentary */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Group Weekly Takings
              </h2>
              <p className="text-xs text-muted-foreground">
                Combined sites, subletting and training income vs target
              </p>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[11px] text-muted-foreground">Sites (chairs)</p>
                <p className="text-sm font-semibold text-foreground">
                  {fmtGBP(summary.revenue.chairRevenue)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[11px] text-muted-foreground">Subletting</p>
                <p className="text-sm font-semibold text-foreground">
                  {fmtGBP(summary.revenue.subletRevenue)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[11px] text-muted-foreground">
                  Training (£92/learner)
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {fmtGBP(summary.revenue.trainingRevenue)}
                </p>
              </div>
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

        {/* 2030 vision glide path */}
        <VisionPanel vision={vision} monthly={monthly} />

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
                  Top 5 performers this week, group-wide
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
                  Headcount Variance
                </h2>
                <p className="text-xs text-muted-foreground">
                  Manager headcount vs barbers who reported · W/E{" "}
                  {fmtWeekLong(summary.week)}
                </p>
              </div>
            </div>
            {headcountVariances.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                All sites reconciled. Every barber on headcount reported.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {headcountVariances.map((v) => {
                  const missing = v.variance > 0
                  return (
                    <div
                      key={v.site}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {v.site}
                        </p>
                        <span
                          className={
                            missing
                              ? "flex shrink-0 items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red"
                              : "flex shrink-0 items-center gap-1 rounded-full bg-rag-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-amber"
                          }
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {missing
                            ? `${v.variance} not reporting`
                            : `${Math.abs(v.variance)} over headcount`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Headcount {v.headcount} · Reported {v.reported} · Action:{" "}
                        {v.manager ?? "Site Manager"}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  Recruitment Triggers
                </h2>
                <p className="text-xs text-muted-foreground">
                  Barbers at ≥95% yield — action manager &amp; HR to recruit
                </p>
              </div>
              {recruitTriggers.length > 0 && (
                <span className="rounded-full bg-rag-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-amber">
                  {recruitTriggers.length} at capacity
                </span>
              )}
            </div>
            {capacityRecruit.triggered && (
              <div className="mb-3 rounded-lg border border-rag-red/30 bg-rag-red/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    Estate at {capacityRecruit.avgUtilisationPct}% utilisation —
                    HR to recruit {capacityRecruit.vacantChairs} barber
                    {capacityRecruit.vacantChairs > 1 ? "s" : ""}
                  </p>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                    <AlertTriangle className="h-3 w-3" />
                    HR action
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {capacityRecruit.totalStaffedChairs}/
                  {capacityRecruit.totalCapacityChairs} chairs filled · average
                  utilisation above 90%. Recruit the{" "}
                  {capacityRecruit.vacantChairs}-chair variance to capacity.
                </p>
              </div>
            )}
            {recruitTriggers.length === 0 ? (
              !capacityRecruit.triggered ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No barbers at capacity. No recruitment action required.
                </p>
              ) : null
            ) : (
              <div className="flex flex-col gap-3">
                {recruitTriggers.map((r) => (
                  <div
                    key={`${r.site}-${r.barber}`}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {r.barber}
                        <span className="text-muted-foreground">
                          {" "}
                          · {r.site}
                        </span>
                      </p>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-rag-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-green">
                        {r.yieldPct}% yield
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      At capacity · Action: {r.manager ?? "Site Manager"} &amp; HR
                      to recruit
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  Expansion Plan
                </h2>
                <p className="text-xs text-muted-foreground">
                  New shops needed vs 5×5 headcount plan ·{" "}
                  {expansion.leadTimeMonths}-month fit-out lead time
                </p>
              </div>
              {expansion.needed && <RagBadge rag={expansion.rag} />}
            </div>
            {!expansion.needed ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {expansion.headline} {expansion.currentChairs} chairs cover the
                projected headcount.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div
                  className={
                    expansion.rag === "red"
                      ? "rounded-lg border border-rag-red/30 bg-rag-red/10 p-3"
                      : "rounded-lg border border-rag-amber/30 bg-rag-amber/10 p-3"
                  }
                >
                  <p className="text-sm font-medium text-foreground">
                    {expansion.headline}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Capacity breached {expansion.breachMonthLabel} ·{" "}
                    {expansion.projectedHeadcountAtBreach} barbers projected vs{" "}
                    {expansion.currentChairs} chairs
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border bg-background p-3 text-center">
                    <p className="text-lg font-semibold text-foreground">
                      {expansion.shopsToOpen}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Shop{expansion.shopsToOpen > 1 ? "s" : ""} to open
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-center">
                    <p className="text-lg font-semibold text-foreground">
                      +{expansion.chairShortfall}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Chairs short
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-center">
                    <p className="text-lg font-semibold text-foreground">
                      {expansion.startByMonthLabel}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {expansion.monthsUntilStart !== null &&
                      expansion.monthsUntilStart <= 0
                        ? "Start now"
                        : "Start by"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Key Risks &amp; Escalations
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
