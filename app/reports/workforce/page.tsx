import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RecruitmentPlanCard } from "@/components/recruitment-plan-card"
import { PipelineTable } from "@/components/pipeline-table"
import { getRecruitmentPlan } from "@/lib/hr"

export const dynamic = "force-dynamic"

export default async function WorkforcePage() {
  const user = await requireDashboard()
  const plan = await getRecruitmentPlan()

  const totalNeed = plan.byRole.reduce((a, r) => a + r.need, 0)
  const totalHave = plan.byRole.reduce((a, r) => a + r.have, 0)
  const pipelineTotal = plan.pipelineByRole.reduce((a, r) => a + r.count, 0)

  return (
    <AppShell user={user}>
      <PageHeader
        meta="HR &amp; People"
        title="Workforce Plan"
        subtitle="Role-by-role recruitment driven by the plan staffing model across all shops and the Training Academy."
      />
      <div className="flex flex-col gap-6 px-5 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="In post"
            value={String(totalHave)}
            sub={`of ${totalNeed} planned roles`}
          />
          <StatCard
            label="To recruit now"
            value={String(plan.totalGap)}
            sub="open shops + academy"
          />
          <StatCard
            label="Apprentices"
            value={`${plan.apprenticesHave}/${plan.apprenticesNeed}`}
            sub="1 required per shop"
          />
          <StatCard
            label="Pipeline"
            value={String(pipelineTotal)}
            sub={`for ${plan.pipeline.length} planned openings`}
          />
        </div>

        <RecruitmentPlanCard plan={plan} />

        <PipelineTable pipeline={plan.pipeline} />
      </div>
    </AppShell>
  )
}
