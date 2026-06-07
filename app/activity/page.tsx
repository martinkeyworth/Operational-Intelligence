import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { ActivityTracker } from "@/components/activity-tracker"
import { getActivitySummary, getSiteOptions } from "@/lib/registers"

export default async function ActivityPage() {
  const user = await requireDashboard()
  const [summary, sites] = await Promise.all([
    getActivitySummary(),
    getSiteOptions(),
  ])

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Leading Indicators"
        title="Activity Tracker"
        subtitle="Log the weekly behaviours that drive results — posts made, recruitment contacts, follow-ups, interviews booked and academy enquiries. Effort is the leading indicator; outcomes follow."
      />
      <div className="px-5 py-6 md:px-8">
        <ActivityTracker summary={summary} sites={sites} />
      </div>
    </AppShell>
  )
}
