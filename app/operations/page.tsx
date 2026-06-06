import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RagBadge } from "@/components/rag"
import { Card } from "@/components/ui/card"
import { getRiskRegister } from "@/lib/data"
import { AlertTriangle, User } from "lucide-react"

export default async function OperationsPage() {
  const user = await requireDashboard()
  const register = await getRiskRegister()

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Weekly Operational Meeting"
        title="Risk Register"
        subtitle="Risks flagged from the action register, grouped by their assigned owner. This is the working agenda for Cosmin's weekly operational meeting."
      />

      <div className="space-y-6 px-5 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Total risks" value={register.total} />
          <StatCard label="Open" value={register.open} />
          <StatCard
            label="Unassigned"
            value={register.unassigned}
            sub={
              register.unassigned > 0
                ? "Assign an owner on the action register"
                : "All risks have an owner"
            }
          />
        </div>

        {register.groups.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No risks flagged yet. Flag actions as risks on the action register to
            build this week&apos;s agenda.
          </Card>
        ) : (
          <div className="space-y-5">
            {register.groups.map((group) => (
              <section key={group.ownerUserId ?? "unassigned"} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {group.ownerName}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {group.risks.length} risk{group.risks.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="space-y-2">
                  {group.risks.map((r) => (
                    <Card
                      key={r.id}
                      className={`flex items-start gap-3 p-4 ${
                        r.status === "Closed" ? "opacity-55" : ""
                      }`}
                    >
                      {r.escalated && r.status !== "Closed" && (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rag-red" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {r.title}
                          </p>
                          <RagBadge rag={r.rag} />
                        </div>
                        {r.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {r.description}
                          </p>
                        )}
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {r.functionArea} · {r.siteName ?? "Group"} · {r.status} ·{" "}
                          {r.priority} priority
                        </p>
                      </div>
                    </Card>
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
