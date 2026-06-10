import Link from "next/link"
import { ArrowRight, Map } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { fmtGBP } from "@/lib/format"
import { getRoadmapProgress } from "@/lib/roadmap"

const MONTHS = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** Compact dashboard card summarising progress through the 5x5 growth plan,
 *  linking to the full /roadmap view. Self-contained server component. */
export async function RoadmapSummaryCard() {
  const progress = await getRoadmapProgress()
  const next = progress.nextMilestone

  return (
    <Link
      href="/roadmap"
      className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Growth Roadmap</h3>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {progress.shopsOpen}
            <span className="text-base text-muted-foreground">/{progress.shopsPlanned}</span>
          </p>
          <p className="text-xs text-muted-foreground">Shops open</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {progress.pctToGoal}%
          </p>
          <p className="text-xs text-muted-foreground">To £5m goal</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {progress.doneCount}
            <span className="text-base text-muted-foreground">/{progress.totalCount}</span>
          </p>
          <p className="text-xs text-muted-foreground">Milestones</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Through the plan (2025–2030)</span>
          <span className="tabular-nums">{progress.pctThroughPlan}%</span>
        </div>
        <Progress value={progress.pctThroughPlan} className="h-2" />
      </div>

      {next && (
        <p className="mt-4 text-xs text-muted-foreground">
          Next:{" "}
          <span className="font-medium text-foreground">{next.title}</span>
          {next.targetMonth ? ` · ${MONTHS[next.targetMonth]} ` : " · "}
          {next.targetYear}
          {progress.currentBarberingTarget
            ? ` · ${fmtGBP(progress.currentBarberingTarget)} barbering planned this year`
            : ""}
        </p>
      )}
    </Link>
  )
}
