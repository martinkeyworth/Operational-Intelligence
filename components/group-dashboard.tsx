import Link from "next/link"
import { Card } from "@/components/ui/card"
import { RagBadge, RagDot } from "@/components/rag"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RevenueTrendChart } from "@/components/revenue-trend-chart"
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
import type { SubmissionSummary } from "@/lib/submissions"
import type { RecruitmentPlan } from "@/lib/hr"
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  UserPlus,
  UserRound,
} from "lucide-react"

/** Short due-date label, e.g. "31 Jul". */
function fmtDue(iso: string) {
  const d = new Date(iso + "T00:00:00")
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function barFill(rag: "green" | "amber" | "red") {
  return rag === "green"
    ? "bg-rag-green"
    : rag === "amber"
      ? "bg-rag-amber"
      : "bg-rag-red"
}

function ragText(rag: "green" | "amber" | "red") {
  return rag === "green"
    ? "text-rag-green"
    : rag === "amber"
      ? "text-rag-amber"
      : "text-rag-red"
}

/** One labelled performance dimension on a site card (e.g. Trading, Capacity),
 *  keeping revenue and capacity visually distinct rather than aggregated. */
function SiteDimension({
  label,
  valueText,
  pct,
  rag,
}: {
  label: string
  valueText: string
  pct: number
  rag: "green" | "amber" | "red"
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${ragText(rag)}`}>{valueText}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barFill(rag)}`}
          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  )
}

export function GroupDashboard({
  summary,
  weeks,
  sites,
  trend,
  barbers,
  actions,
  scorecard,
  submissions,
  recruitment,
}: {
  summary: GroupSummary
  weeks: string[]
  sites: SiteWeekRow[]
  trend: TrendPoint[]
  barbers: BarberWeekRow[]
  actions: ActionRow[]
  scorecard: BusinessScorecard
  submissions: SubmissionSummary
  recruitment: RecruitmentPlan
}) {
  const risks = actions
    .filter((a) => a.status !== "Closed" && (a.rag === "red" || a.escalated))
    .slice(0, 5)
  const reporting = barbers.filter((b) => b.reported)
  const leaderboard = reporting.slice(0, 5)

  // The overview measures against ONE consistent yardstick: the current
  // operating target (what today's team + chairs should realistically bill —
  // sum of per-barber weekly targets + sublet + training). The stretch 5×5 /
  // 2030 plan requirement lives in the dedicated 2030 Plan view so the two
  // targets never sit side-by-side looking like a calculation error.
  const opRag = ragFromAttainment(summary.attainmentPct)
  const opDelta = summary.weekRevenue - summary.weekTarget
  const wowRag: "green" | "amber" | "red" =
    summary.wowPct >= 0 ? "green" : summary.wowPct <= -15 ? "red" : "amber"

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

  // Role-aware recruitment: the plan staffing model (manager + brand cutting
  // staff + apprentice per shop, plus academy trainers/assessors) drives the
  // true recruitment requirement, not just vacant chairs. Full detail lives on
  // the Workforce Plan page; here we surface the headline gap and worst shops.
  const recruitGapSites = recruitment.sites
    .filter((s) => s.totalGap > 0)
    .sort((a, b) => b.totalGap - a.totalGap)
  const topRecruitRoles = recruitment.byRole
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.gap - a.gap)

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
        <Link href="/reports/submissions" aria-label="View weekly submissions">
          <RagBadge
            rag={
              submissions.complete
                ? "green"
                : submissions.pct >= 75
                  ? "amber"
                  : "red"
            }
            label={
              submissions.complete
                ? `${summary.confirmedSites}/${summary.siteCount} confirmed · all data in`
                : `${summary.confirmedSites}/${summary.siteCount} confirmed · ${submissions.outstandingCount} outstanding`
            }
            className="px-3 py-1 text-sm"
          />
        </Link>
        <WeekSelector weeks={weeks} current={summary.week} />
      </PageHeader>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label={`Takings · W/E ${fmtWeekLong(summary.week)}`}
            value={fmtGBP(summary.weekRevenue)}
            sub={
              summary.weekTarget > 0 ? (
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <RagBadge rag={opRag} />
                    <span
                      className={
                        opRag === "green"
                          ? "text-rag-green"
                          : opRag === "amber"
                            ? "text-rag-amber"
                            : "text-rag-red"
                      }
                    >
                      {summary.attainmentPct.toFixed(0)}% of operating target
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {opDelta >= 0 ? "+" : "-"}
                    {fmtGBP(Math.abs(opDelta))} vs {fmtGBP(summary.weekTarget)}{" "}
                    target
                  </span>
                </span>
              ) : (
                "No operating target set"
              )
            }
          />
          <StatCard
            label="Week-on-week"
            value={
              <span
                className={
                  wowRag === "green"
                    ? "text-rag-green"
                    : wowRag === "amber"
                      ? "text-rag-amber"
                      : "text-rag-red"
                }
              >
                {summary.wowPct >= 0 ? "↑" : "↓"}
                {Math.abs(summary.wowPct).toFixed(0)}%
              </span>
            }
            sub={
              <span className="text-xs text-muted-foreground">
                vs {fmtGBP(summary.prevWeekRevenue)} last week
              </span>
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
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {s.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.siteType === "training"
                        ? `${s.location} · Academy`
                        : s.location}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {s.confirmed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-rag-green" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-rag-amber" />
                    )}
                    <span
                      className={
                        s.rag === "green"
                          ? "flex items-center gap-1 rounded-full bg-rag-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-green"
                          : s.rag === "amber"
                            ? "flex items-center gap-1 rounded-full bg-rag-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-amber"
                            : "flex items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red"
                      }
                    >
                      {s.rag === "green"
                        ? "On track"
                        : s.rag === "amber"
                          ? "At risk"
                          : "Critical"}
                    </span>
                  </span>
                </div>
                {s.siteType === "training" ? (
                  <div className="mt-3">
                    <SiteDimension
                      label="Learner capacity"
                      valueText={s.trainingRag === "green" ? "On track" : "Below"}
                      pct={100}
                      rag={s.trainingRag}
                    />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2.5">
                    <SiteDimension
                      label="Trading vs target"
                      valueText={`${s.attainmentPct.toFixed(0)}% · ${fmtGBP(
                        s.weekRevenue,
                      )}`}
                      pct={s.attainmentPct}
                      rag={ragFromAttainment(s.attainmentPct)}
                    />
                    <SiteDimension
                      label="Staffed capacity"
                      valueText={`${s.activeBarbers}/${s.chairCapacity} chairs${
                        s.chairCapacity > 0
                          ? ` · ${Math.round(
                              (s.activeBarbers / s.chairCapacity) * 100,
                            )}%`
                          : ""
                      }`}
                      pct={
                        s.chairCapacity > 0
                          ? (s.activeBarbers / s.chairCapacity) * 100
                          : 0
                      }
                      rag={s.utilisationRag}
                    />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RagDot rag={s.rtbRag} />
                      Revenue to business
                    </div>
                  </div>
                )}
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
                  Recruitment &amp; Capacity
                </h2>
                <p className="text-xs text-muted-foreground">
                  Role gaps vs the plan model, plus barbers at ≥95% yield
                </p>
              </div>
              <Link
                href="/reports/workforce"
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Workforce Plan
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recruitment.totalGap > 0 ? (
              <Link
                href="/reports/workforce"
                className="mb-3 block rounded-lg border border-rag-red/30 bg-rag-red/10 p-3 transition-colors hover:bg-rag-red/15"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    HR to recruit {recruitment.totalGap} role
                    {recruitment.totalGap > 1 ? "s" : ""} to meet the plan
                    staffing model
                  </p>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                    <AlertTriangle className="h-3 w-3" />
                    HR action
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topRecruitRoles.map((r) => (
                    <span
                      key={r.role}
                      className="rounded-md border border-rag-red/30 bg-background px-1.5 py-0.5 text-[11px] text-rag-red"
                    >
                      {r.role} +{r.gap}
                    </span>
                  ))}
                </div>
                {recruitGapSites.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {recruitGapSites
                      .slice(0, 3)
                      .map((s) => `${s.siteName} (${s.totalGap})`)
                      .join(" · ")}
                    {recruitGapSites.length > 3
                      ? ` +${recruitGapSites.length - 3} more`
                      : ""}
                  </p>
                )}
              </Link>
            ) : (
              <div className="mb-3 rounded-lg border border-rag-green/30 bg-rag-green/10 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-rag-green" />
                  All shops meet the plan staffing model
                </p>
              </div>
            )}
            {recruitTriggers.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No barbers at ≥95% yield this week.
              </p>
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
                <h2 className="text-sm font-semibold text-foreground">
                  Decisions &amp; Interventions Required
                </h2>
                <p className="text-xs text-muted-foreground">
                  Critical &amp; escalated items — what must happen, who owns it,
                  and by when
                </p>
              </div>
              <Link
                href="/governance?tab=actions"
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
                  <Link
                    key={r.id}
                    href={`/governance?tab=actions&focus=${r.id}`}
                    className="block rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {r.title}
                      </p>
                      {r.overdue ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                          <AlertTriangle className="h-3 w-3" />
                          {r.daysOverdue}d overdue
                        </span>
                      ) : (
                        r.escalated && (
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                            <AlertTriangle className="h-3 w-3" />
                            Escalated
                          </span>
                        )
                      )}
                    </div>
                    {r.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {r.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        {r.functionArea}
                        {r.siteName ? ` · ${r.siteName}` : " · Group"}
                      </span>
                      <span className="flex items-center gap-1">
                        <UserRound className="h-3 w-3" />
                        {r.ownerLabel}
                      </span>
                      <span
                        className={`flex items-center gap-1 ${
                          r.overdue ? "font-medium text-rag-red" : ""
                        }`}
                      >
                        <CalendarClock className="h-3 w-3" />
                        {r.dueDate ? fmtDue(r.dueDate) : "No due date"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
