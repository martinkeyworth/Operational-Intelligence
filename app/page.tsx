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
  getActions,
  getBusinessScorecard,
} from "@/lib/data"
import { getSubmissionStatus } from "@/lib/submissions"

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

  const [summary, sites, trend, actions, scorecard, submissions] =
    await Promise.all([
      getGroupSummary(week),
      getSiteWeek(week),
      getGroupTrend(),
      getActions(),
      getBusinessScorecard(week),
      getSubmissionStatus(week),
    ])

  return (
    <AppShell user={user}>
      <GroupDashboard
        summary={summary}
        weeks={weeks}
        sites={sites}
        trend={trend}
        actions={actions}
        scorecard={scorecard}
        submissions={submissions}
      />
      <div className="px-5 pb-8 md:px-8">
        <RoadmapSummaryCard />
      </div>
    </AppShell>
  )
}
