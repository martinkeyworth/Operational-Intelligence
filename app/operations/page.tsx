import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { OperationsActionCard } from "@/components/operations-action-card"
import { getRiskRegister, getAssignableOwners } from "@/lib/data"
import { User } from "lucide-react"

export default async function OperationsPage() {
  const user = await requireDashboard()
  const [register, owners] = await Promise.all([
    getRiskRegister(),
    getAssignableOwners(),
  ])

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Weekly Operational Meeting"
        title="Risk & Action Register"
        subtitle="Every live action being undertaken, grouped by its assigned owner. Amend the RAG, status, owner and risk flag here during Cosmin's weekly meeting — changes write straight back to the action register."
      />

      <div className="space-y-6 px-5 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Live actions" value={register.total} />
          <StatCard label="Open" value={register.open} />
          <StatCard label="Flagged risks" value={register.riskCount} />
          <StatCard
            label="Unassigned"
            value={register.unassigned}
            sub={
              register.unassigned > 0
                ? "Assign an owner below"
                : "All actions have an owner"
            }
          />
        </div>

        {register.groups.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No live actions. New actions raised on the register will appear here
            for the weekly operational meeting.
          </Card>
        ) : (
          <div className="space-y-5">
            {register.groups.map((group) => (
              <section
                key={group.ownerUserId ?? "unassigned"}
                className="space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {group.ownerName}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {group.risks.length} action
                    {group.risks.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="space-y-2">
                  {group.risks.map((r) => (
                    <OperationsActionCard key={r.id} action={r} owners={owners} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
