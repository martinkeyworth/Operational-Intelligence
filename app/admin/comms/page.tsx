import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/access"
import { getCommSettings } from "@/lib/comms"
import { CommsToggles } from "@/components/admin/comms-toggles"

export const dynamic = "force-dynamic"

export default async function CommsPage() {
  const user = await requireAdmin()
  if (!user.isOwner) redirect("/no-access")

  const settings = await getCommSettings()

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:px-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground text-balance">
          Communications
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Turn each automated message or chaser on or off. Paused channels stop
          sending immediately (no publish needed) and can be switched back on at
          any time. Sign-in, holiday approvals and other interactive emails are
          never affected.
        </p>
      </header>

      <CommsToggles initial={settings} canEdit={Boolean(user.isOwner)} />
    </main>
  )
}
