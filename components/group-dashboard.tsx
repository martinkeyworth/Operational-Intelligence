import Link from "next/link"
import { Card } from "@/components/ui/card"
import { RagBadge, RagDot } from "@/components/rag"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RevenueTrendChart } from "@/components/revenue-trend-chart"
import { WeekSelector } from "@/components/week-selector"
import { fmtGBP, fmtWeekLong, ragFromAttainment } from "@/lib/data"
import type {
  GroupSummary,
  SiteWeekRow,
  TrendPoint,
  ActionRow,
  BusinessScorecard,
} from "@/lib/data"
import type { SubmissionSummary } from "@/lib/submissions"
import { ArrowRight, CheckCircle2, Clock } from "lucide-react"

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
  actions,
  scorecard,
  submissions,
}: {
  summary: GroupSummary
  weeks: string[]
  sites: SiteWeekRow[]
  trend: TrendPoint[]
  actions: ActionRow[]
  scorecard: BusinessScorecard
  submissions: SubmissionSummary
}) {
  const risks = actions
    .filter((a) => a.status !== "Closed" && (a.rag === "red" || a.escalated))
    .slice(0, 5)

  // The overview measures against ONE consistent yardstick: the current
  // operating target (what today's team + chairs should realistically bill —
  // sum of per-barber weekly targets + sublet + training). The stretch 5×5 /
  // 2030 plan requirement lives in the dedicated 2030 Plan view so the two
  // targets never sit side-by-side looking like a calculation error.
  const opRag = ragFromAttainment(summary.attainmentPct)
  const opDelta = summary.weekRevenue - summary.weekTarget
  const wowRag: "green" | "amber" | "red" =
    summary.wowPct >= 0 ? "green" : summary.wowPct <= -15 ? "red" : "amber"

  return (
    <div>
      <PageHeader
        meta="Group Executive View"
        title="Operational Intelligence & Governance"
        subtitle="Weekly group performance, RAG status and key risks across all LTZ sites. Saturday-to-Saturday reporting with worst-status roll-up at every level."
      >
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

        {/* Group weekly takings: actual vs target */}
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              Group Revenue Tracker
            </h2>
            <p className="text-xs text-muted-foreground">
              Actual revenue vs target
            </p>
          </div>
          <RevenueTrendChart data={trend} />
        </Card>

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
                  <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {s.confirmed ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-rag-green" />
                        Confirmed
                      </>
                    ) : (
                      <>
                        <Clock className="h-3.5 w-3.5 text-rag-amber" />
                        Awaiting
                      </>
                    )}
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

        {/* Decisions & interventions — linked to the RAID register */}
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
              RAID register
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
            {risks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No critical risks. All clear.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {risks.map((r) => (
                  <Link
                    key={r.id}
                    href={`/governance?tab=actions&focus=${r.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {r.title}
                    </p>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
      </div>
    </div>
  )
}
