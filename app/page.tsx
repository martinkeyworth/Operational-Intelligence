import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { GroupDashboard } from "@/components/group-dashboard"
import { RoadmapSummaryCard } from "@/components/roadmap-summary-card"
import {
  getSelectableWeeks,
  getLeadershipDefaultWeek,
  getGroupSummary,
  getSiteWeek,
  getGroupTrend,
  getBarberWeek,
  getActions,
  getBusinessScorecard,
} from "@/lib/data"
import {
  getVisionGlidePath,
  getVisionMonthlyPlan,
  getExpansionPlan,
  getPlanProgress,
} from "@/lib/vision"
import { getSubmissionStatus } from "@/lib/submissions"
import { getRecruitmentPlan } from "@/lib/hr"

export default async function Page({
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

  const [
    summary,
    sites,
    trend,
    barbers,
    actions,
    scorecard,
    vision,
    monthly,
    expansion,
    planProgress,
    submissions,
    recruitment,
  ] = await Promise.all([
    getGroupSummary(week),
    getSiteWeek(week),
    getGroupTrend(),
    getBarberWeek(week),
    getActions(),
    getBusinessScorecard(week),
    getVisionGlidePath(),
    getVisionMonthlyPlan(),
    getExpansionPlan(),
    getPlanProgress(),
    getSubmissionStatus(week),
    getRecruitmentPlan(),
  ])

  return (
    <AppShell user={user}>
      <GroupDashboard
        summary={summary}
        weeks={weeks}
        sites={sites}
        trend={trend}
        barbers={barbers}
        actions={actions}
        scorecard={scorecard}
        vision={vision}
        monthly={monthly}
        expansion={expansion}
        planProgress={planProgress}
        submissions={submissions}
        recruitment={recruitment}
      />
      <div className="px-5 pb-8 md:px-8">
        <RoadmapSummaryCard />
      </div>
    </AppShell>
  )
}
