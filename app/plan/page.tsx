import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PlanView } from "@/components/plan-view"
import {
  getSelectableWeeks,
  getLeadershipDefaultWeek,
  getGroupSummary,
} from "@/lib/data"
import {
  getVisionGlidePath,
  getVisionMonthlyPlan,
  getExpansionPlan,
  getPlanProgress,
} from "@/lib/vision"

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireDashboard()

  const { week: weekParam } = await searchParams
  const weeks = await getSelectableWeeks()
  const week =
    weekParam && weeks.includes(weekParam)
      ? weekParam
      : await getLeadershipDefaultWeek()

  if (!week) {
    return (
      <AppShell user={user}>
        <div className="p-8 text-sm text-muted-foreground">
          No takings have been reported yet.
        </div>
      </AppShell>
    )
  }

  const [summary, vision, monthly, expansion, planProgress] = await Promise.all([
    getGroupSummary(week),
    getVisionGlidePath(),
    getVisionMonthlyPlan(),
    getExpansionPlan(),
    getPlanProgress(),
  ])

  return (
    <AppShell user={user}>
      <PlanView
        summary={summary}
        vision={vision}
        monthly={monthly}
        expansion={expansion}
        planProgress={planProgress}
      />
    </AppShell>
  )
}
