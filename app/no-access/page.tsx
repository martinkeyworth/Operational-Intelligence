import Link from "next/link"
import { requireUser } from "@/lib/access"
import { buttonVariants } from "@/components/ui/button"
import { ClipboardEdit, ShieldAlert } from "lucide-react"
import { SignOutButton } from "@/components/sign-out-button"

export default async function NoAccessPage() {
  const user = await requireUser()

  // Barbers/data-entry users get a friendly route to their task.
  const canEnterData = user.isBarber || user.canViewDashboard

  return (
    <main className="min-h-svh bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
          <ShieldAlert className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-balance text-xl font-semibold text-foreground">
          You don&apos;t have dashboard access
        </h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          Hi {user.name.split(" ")[0]} — your account isn&apos;t set up to view
          the group dashboard. If you think this is a mistake, ask a member of
          the LTZ leadership team to grant you access.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {canEnterData && (
            <Link href="/data-entry" className={buttonVariants({ className: "h-11 text-base" })}>
              <ClipboardEdit className="mr-2 h-4 w-4" />
              Go to Weekly Takings
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
