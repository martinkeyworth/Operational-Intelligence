import { redirect } from "next/navigation"
import { requireUser, managerSiteLanding } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { MyWorkView } from "@/components/my-work-view"
import { getMyWork } from "@/lib/my-work"

export const metadata = {
  title: "My Work · LTZ Governance",
  description: "What needs your attention right now.",
}

export default async function MyWorkPage() {
  const user = await requireUser()

  // Non-dashboard site managers work entirely from their own site page — send
  // them straight there rather than the generic My Work / all-sites surfaces.
  const siteLanding = managerSiteLanding(user)
  if (siteLanding) redirect(siteLanding)

  const work = await getMyWork(user)

  return (
    <AppShell user={user}>
      <MyWorkView
        userName={user.name}
        work={work}
        showFullView={user.canViewDashboard}
      />
    </AppShell>
  )
}
