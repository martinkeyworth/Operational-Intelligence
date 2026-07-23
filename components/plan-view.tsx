import { Card } from "@/components/ui/card"
import { RagBadge, RagDot } from "@/components/rag"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { VisionPanel } from "@/components/vision-panel"
import { RoadmapSummaryCard } from "@/components/roadmap-summary-card"
import { fmtGBP, fmtWeekLong, ragFromAttainment } from "@/lib/data"
import type { GroupSummary } from "@/lib/data"
import type {
  VisionGlidePath,
  VisionMonthlyPlan,
  ExpansionRecommendation,
  PlanBoardSummary,
} from "@/lib/vision"
import { Store, Target } from "lucide-react"

export function PlanView({
  summary,
  vision,
  monthly,
  expansion,
  planProgress,
}: {
  summary: GroupSummary
  vision: VisionGlidePath
  monthly: VisionMonthlyPlan
  expansion: ExpansionRecommendation
  planProgress: PlanBoardSummary
}) {
  // 5×5 plan weekly target: this month's required chair takings spread across
  // the ~4.33 weeks in a month. This is the STRETCH target vs the £5m glide
  // path — deliberately kept here in the strategic view, separate from the
  // operating target shown on the Group Overview.
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

  return (
    <div>
      <PageHeader
        meta="Strategic Plan"
        title="2030 Plan"
        subtitle="The LTZ 2025–2030 growth model — £5m group revenue, shop roll-out, headcount and revenue-to-business trajectory, and how the group is pacing against it."
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Plan RAG · {planProgress.chairAttainmentPct}%
          </span>
          <RagBadge rag={planProgress.chairRag} className="px-3 py-1 text-sm" />
        </div>
      </PageHeader>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Operating vs strategic target contrast */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label={`Takings · W/E ${fmtWeekLong(summary.week)}`}
            value={fmtGBP(summary.weekRevenue)}
            sub={
              <span className="text-xs text-muted-foreground">
                Actual group takings this week
              </span>
            }
          />
          <StatCard
            label="Operating target"
            value={`${summary.attainmentPct.toFixed(0)}%`}
            sub={
              <span className="text-xs text-muted-foreground">
                of {fmtGBP(summary.weekTarget)} — what today&apos;s team should
                bill
              </span>
            }
          />
          <StatCard
            label="5×5 plan requirement"
            value={
              planWeeklyTarget > 0 ? (
                <span
                  className={
                    planRag === "green"
                      ? "text-rag-green"
                      : planRag === "amber"
                        ? "text-rag-amber"
                        : "text-rag-red"
                  }
                >
                  {planAttainmentPct.toFixed(0)}%
                </span>
              ) : (
                "—"
              )
            }
            sub={
              planWeeklyTarget > 0 ? (
                <span className="text-xs text-muted-foreground">
                  of {fmtGBP(planWeeklyTarget)} — {planDelta >= 0 ? "+" : "-"}
                  {fmtGBP(Math.abs(planDelta))} vs the £5m glide path
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  No 5×5 target set
                </span>
              )
            }
          />
        </div>

        {/* Board summary vs plan milestones */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Target className="h-4 w-4 text-muted-foreground" />
                Board Summary — {planProgress.quarterLabel}
              </h2>
              <p className="text-xs text-muted-foreground">
                Tracking vs the LTZ 2025–2030 plan milestones
              </p>
            </div>
            <RagBadge rag={planProgress.chairRag} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Chair turnover
                </p>
                <RagDot rag={planProgress.chairRag} />
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {fmtGBP(planProgress.chairAnnualised)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {planProgress.chairAttainmentPct}% of{" "}
                {fmtGBP(planProgress.chairMilestone)} {planProgress.year}{" "}
                milestone
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Shops open
                </p>
                <RagDot rag={planProgress.shopsRag} />
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {planProgress.shopsOpen} / {planProgress.shopsPlanned}
              </p>
              <p className="text-[11px] text-muted-foreground">
                open vs planned by now
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Headcount
                </p>
                <RagDot rag={planProgress.headcountRag} />
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {planProgress.headcountActual} / {planProgress.headcountPlanned}
              </p>
              <p className="text-[11px] text-muted-foreground">
                barbers vs plan (4/shop)
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Academy income target {planProgress.year}:{" "}
              <span className="font-medium text-foreground">
                {fmtGBP(planProgress.academyMilestone)}
              </span>{" "}
              · Group revenue target{" "}
              <span className="font-medium text-foreground">
                {fmtGBP(planProgress.totalMilestone)}
              </span>
            </span>
            {planProgress.nextOpeningLabel && (
              <span>
                Next opening:{" "}
                <span className="font-medium text-foreground">
                  {planProgress.nextOpeningLabel}
                </span>
              </span>
            )}
          </div>
        </Card>

        {/* 2030 vision glide path */}
        <VisionPanel vision={vision} monthly={monthly} />

        {/* Expansion plan */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Store className="h-4 w-4 text-muted-foreground" />
                Expansion Plan
              </h2>
              <p className="text-xs text-muted-foreground">
                Next opening on the LTZ plan schedule ·{" "}
                {expansion.leadTimeMonths}-month fit-out lead time
              </p>
            </div>
            {expansion.needed && <RagBadge rag={expansion.rag} />}
          </div>
          {!expansion.needed ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {expansion.headline} {expansion.actualShopsOpen} shops open.
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
                  {expansion.actualShopsOpen}/{expansion.plannedShopsByNow} shops
                  open vs plan · {expansion.currentChairs} chairs across the
                  estate
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <p className="text-lg font-semibold text-foreground">
                    {expansion.nextOpeningTier ?? "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {expansion.nextOpeningLocation ?? "Next brand"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <p className="text-lg font-semibold text-foreground">
                    {expansion.nextOpeningMonthLabel}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Opens</p>
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

        <RoadmapSummaryCard />
      </div>
    </div>
  )
}
