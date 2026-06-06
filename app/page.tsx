import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
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
} from "@/lib/data"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const { week: weekParam } = await searchParams
  const weeks = await getWeeks()
  const week = weekParam && weeks.includes(weekParam) ? weekParam : (await getLatestWeek())

  if (!week) {
    return (
      <AppShell user={session.user as never}>
        <div className="p-8 text-sm text-muted-foreground">
          No takings have been reported yet.
        </div>
      </AppShell>
    )
  }

  const [summary, sites, trend, barbers, actions] = await Promise.all([
    getGroupSummary(week),
    getSiteWeek(week),
    getGroupTrend(),
    getBarberWeek(week),
    getActions(),
  ])

  return (
    <AppShell user={session.user as never}>
      <GroupDashboard
        summary={summary}
        weeks={weeks}
        sites={sites}
        trend={trend}
        barbers={barbers}
        actions={actions}
      />
    </AppShell>
  )
}
