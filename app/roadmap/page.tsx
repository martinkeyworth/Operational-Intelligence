import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { RoadmapView } from "@/components/roadmap-view"
import {
  getProjection,
  getMilestones,
  getAssumptions,
  getRoadmapProgress,
  academyComparison,
} from "@/lib/roadmap"

export default async function RoadmapPage() {
  const user = await requireDashboard()

  const [{ years, salaries, map }, milestones, assumptions, progress] =
    await Promise.all([
      getProjection(),
      getMilestones(),
      getAssumptions(),
      getRoadmapProgress(),
    ])

  const academy = academyComparison(map)
  // Finance figures (assumptions + salaries) are admin-editable only.
  const canEditFinance = user.isCompany && user.canViewDashboard

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Strategy"
        title="Growth Roadmap"
        subtitle="The 5x5 plan made explicit: what needs to happen by when to pass £5m barbering turnover by 2029/30, and every assumption that flows from it — academy economics, leadership salaries, profit and dividends."
      />
      <div className="px-5 py-6 md:px-8">
        <RoadmapView
          years={years}
          salaries={salaries}
          assumptions={assumptions}
          milestones={milestones}
          progress={progress}
          academy={academy}
          canEditFinance={canEditFinance}
        />
      </div>
    </AppShell>
  )
}
