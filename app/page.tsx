import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { GroupDashboard } from "@/components/group-dashboard"
import {
  getWeeks,
  getLatestWeek,
  getGroupSummary,
  getSiteWeek,
  getGroupTrend,
  getBarberWeek,
  getActions,
  getBusinessScorecard,
} from "@/lib/data"
import { getVisionGlidePath, getVisionMonthlyPlan } from "@/lib/vision"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireDashboard()

  const { week: weekParam } = await searchParams
  const weeks = await getWeeks()
  const week = weekParam && weeks.includes(weekParam) ? weekParam : (await getLatestWeek())

  if (!week) {
    return (
      <AppShell user={user}>
        <div className="p-8 text-sm text-muted-foreground">
          No takings have been reported yet.
        </div>
      </AppShell>
    )
  }

  const [summary, sites, trend, barbers, actions, scorecard, vision, monthly] =
    await Promise.all([
      getGroupSummary(week),
      getSiteWeek(week),
      getGroupTrend(),
      getBarberWeek(week),
      getActions(),
      getBusinessScorecard(week),
      getVisionGlidePath(),
      getVisionMonthlyPlan(),
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
      />
    </AppShell>
  )
}
