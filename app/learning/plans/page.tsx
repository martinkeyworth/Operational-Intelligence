import { requireUser, canManageLearning } from "@/lib/access"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { PlansRoster } from "@/components/learning/plans-roster"
import { getLearningRoster } from "@/lib/learning"

export const dynamic = "force-dynamic"

export default async function LearningPlansPage() {
  const user = await requireUser()
  // L&D managers see everyone; a manager with reports sees their own team.
  const isManager = canManageLearning(user)
  if (!isManager && !user.canViewDashboard) {
    // A plain barber's plan lives in their Team Area.
    redirect("/team")
  }

  const rows = await getLearningRoster(isManager ? null : user.id)

  return (
    <AppShell user={user}>
      <PageHeader
        meta="L&D – Training"
        title="Learning plans"
        subtitle="Development plans, monthly 1-2-1 status and PBC scores"
      />
      <div className="px-5 py-6 md:px-8">
        <PlansRoster rows={rows} />
      </div>
    </AppShell>
  )
}
