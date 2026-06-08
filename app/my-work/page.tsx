import { requireUser } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { MyWorkView } from "@/components/my-work-view"
import { getMyWork } from "@/lib/my-work"

export const metadata = {
  title: "My Work · LTZ Governance",
  description: "What needs your attention right now.",
}

export default async function MyWorkPage() {
  const user = await requireUser()
  const work = await getMyWork(user)

  return (
    <AppShell user={user}>
      <MyWorkView userName={user.name} work={work} />
    </AppShell>
  )
}
