import { requireAdmin } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { AdminTabs } from "@/components/admin-tabs"

// One shell + tab strip for every /admin/* page, so all management lives in a
// single, consistent area. Page-level guards still run (e.g. owner-only tabs).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAdmin()
  return (
    <AppShell user={user}>
      <AdminTabs isOwner={Boolean(user.isOwner)} />
      {children}
    </AppShell>
  )
}
