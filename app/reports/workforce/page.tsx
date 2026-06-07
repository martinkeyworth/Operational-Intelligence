import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RecruitmentPlanCard } from "@/components/recruitment-plan-card"
import { getRecruitmentPlan } from "@/lib/hr"

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
const fmtMonth = (year: number, month: number) =>
  `${MONTH_LABELS[month - 1]} ${year}`

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

        {plan.pipeline.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-muted/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">
                Planned opening pipeline
              </h2>
              <p className="text-xs text-muted-foreground">
                Roles to recruit ahead of each scheduled opening.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Opening</th>
                  <th className="px-4 py-2 text-left font-medium">When</th>
                  <th className="px-4 py-2 text-left font-medium">Roles</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {plan.pipeline.map((op) => (
                  <tr
                    key={`${op.location}-${op.year}-${op.month}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-2.5 text-foreground">
                      {op.location}
                      <span className="text-muted-foreground"> · {op.tier}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {fmtMonth(op.year, op.month)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {op.roles.map((r) => (
                          <span
                            key={r.role}
                            className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {r.count} {r.role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
                      {op.totalRoles}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
