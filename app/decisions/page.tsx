import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { DecisionRegister } from "@/components/decision-register"
import { getDecisions, getSiteOptions } from "@/lib/registers"

export default async function DecisionsPage() {
  const user = await requireDashboard()
  const [decisions, sites] = await Promise.all([
    getDecisions(),
    getSiteOptions(),
  ])

  const active = decisions.filter((d) => d.status === "Active").length
  const dueReview = decisions.filter(
    (d) => d.reviewDate && d.reviewDate <= new Date().toISOString().slice(0, 10),
  ).length

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Governance"
        title="Decision Register"
        subtitle="A single record of every material decision — what was decided, by whom, when and why. Completes the RAID model alongside the Risk, Issue and Action registers."
      />
      <div className="px-5 py-6 md:px-8 space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total decisions" value={decisions.length} />
          <StatCard label="Active" value={active} />
          <StatCard
            label="Superseded / reversed"
            value={decisions.length - active}
          />
          <StatCard label="Due for review" value={dueReview} />
        </div>
        <DecisionRegister decisions={decisions} sites={sites} />
      </div>
    </AppShell>
  )
}
