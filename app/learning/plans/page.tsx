import { requireUser, canManageLearning } from "@/lib/access"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { PlansRoster } from "@/components/learning/plans-roster"
import { getLearningRoster, hasDirectReports } from "@/lib/learning"

export const dynamic = "force-dynamic"

export default async function LearningPlansPage() {
  const user = await requireUser()

  // Who sees what:
  //  - L&D managers (owners, training lead, company dashboard users) see EVERYONE.
  //  - Any other manager who has direct reports sees just their own team.
  //  - A plain barber has no roster; their plan lives in their Team Area.
  const isLdManager = canManageLearning(user)
  let scopeToUserId: string | null = null
  if (!isLdManager) {
    const managesTeam = await hasDirectReports(user.id)
    if (!managesTeam && !user.canViewDashboard) {
      redirect("/team")
    }
    scopeToUserId = user.id
  }

  const rows = await getLearningRoster(scopeToUserId)

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
