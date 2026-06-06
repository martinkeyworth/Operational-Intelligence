import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { ActionsTable } from "@/components/actions-table"
import { getActions } from "@/lib/data"

export default async function ActionsPage() {
  const user = await requireDashboard()

  const actions = await getActions()

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Action Management"
        title="Action Register"
        subtitle="Owned, tracked and escalated actions across all functions. Update status inline as work progresses."
      />
      <div className="px-5 py-6 md:px-8">
        <ActionsTable actions={actions} />
      </div>
    </AppShell>
  )
}
