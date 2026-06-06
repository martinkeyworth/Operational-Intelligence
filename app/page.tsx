import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { GroupDashboard } from "@/components/group-dashboard"
import {
  getGroupSummary,
  getSites,
  getGroupRevenueTrend,
  getKpiScorecards,
  getDepartments,
  getActions,
} from "@/lib/data"

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const [summary, sites, trend, scorecards, departments, actions] =
    await Promise.all([
      getGroupSummary(),
      getSites(),
      getGroupRevenueTrend(),
      getKpiScorecards(),
      getDepartments(),
      getActions(),
    ])

  return (
    <AppShell user={session.user as never}>
      <GroupDashboard
        summary={summary}
        sites={sites}
        trend={trend}
        scorecards={scorecards}
        departments={departments}
        actions={actions}
      />
    </AppShell>
  )
}
