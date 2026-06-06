import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { ActionsTable } from "@/components/actions-table"
import { getActions } from "@/lib/data"

export default async function ActionsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const actions = await getActions()

  return (
    <AppShell user={session.user as never}>
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
