import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { ActionsTable } from "@/components/actions-table"
import { getActions, getAssignableOwners } from "@/lib/data"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CalendarClock } from "lucide-react"

export default async function ActionsPage() {
  const user = await requireDashboard()

  const [actions, owners] = await Promise.all([
    getActions(),
    getAssignableOwners(),
  ])

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Action Management"
        title="Action Register"
        subtitle="Owned, tracked and escalated actions across all functions. Assign an owner and flag risks to feed the weekly operational meeting. Update status inline as work progresses."
      >
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/operations">
            <CalendarClock className="h-4 w-4" />
            Operational meeting
          </Link>
        </Button>
      </PageHeader>
      <div className="px-5 py-6 md:px-8">
        <ActionsTable actions={actions} owners={owners} />
      </div>
    </AppShell>
  )
}
