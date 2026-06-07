import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { ContinuityBriefingView } from "@/components/continuity-briefing-view"
import { getContinuityBriefing } from "@/lib/continuity"

export default async function ContinuityPage() {
  const user = await requireDashboard()
  const briefing = await getContinuityBriefing()

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Leadership Continuity"
        title="CEO Continuity Briefing"
        subtitle="If leadership were unavailable for 30 days, this is the live answer the platform gives the team: what is off track, why, who owns recovery, what is overdue, which strategic objectives are at risk, and what must happen next."
      />
      {briefing ? (
        <ContinuityBriefingView data={briefing} />
      ) : (
        <div className="px-5 py-6 md:px-8">
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No weekly data has been reported yet, so there is nothing to brief
            on. The continuity view populates as soon as the first week of
            takings and KPIs is entered.
          </Card>
        </div>
      )}
    </AppShell>
  )
}
