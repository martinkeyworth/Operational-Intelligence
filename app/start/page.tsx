import Link from "next/link"
import { ClipboardList, LayoutDashboard, ChevronRight } from "lucide-react"
import { requireUser, defaultLandingFor } from "@/lib/access"
import { SignOutButton } from "@/components/sign-out-button"

export const metadata = {
  title: "Welcome · LTZ",
  description: "Choose where to go.",
}

/**
 * Post-sign-in chooser. Everyone picks between the quick Daily input screen and
 * the wider view (their role-based dashboard / work board). The wider-view
 * destination is resolved server-side so scoping/permissions are preserved.
 */
export default async function StartPage() {
  const user = await requireUser()
  const widerHref = defaultLandingFor(user)
  const firstName = user.name.trim().split(/\s+/)[0] || "there"
  // A plain barber's "wider view" is their own personal work board (/my-work);
  // dashboard/site users get the broader leadership view. Describe accordingly.
  const widerLabel = user.canViewDashboard ? "Wider view" : "My work"
  const widerDescription = user.canViewDashboard
    ? "Your dashboard, sites, reports and everything you have access to."
    : "Your actions, learning and 1-2-1s — everything assigned to you."

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-balance">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where would you like to go?
          </p>
        </div>
        <SignOutButton />
      </header>

      <div className="flex flex-col gap-3">
        <Link
          href="/today"
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-muted"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Daily input</span>
            <span className="block text-sm text-muted-foreground">
              Log today&apos;s takings and see what needs your attention.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Link
          href={widerHref}
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-muted"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LayoutDashboard className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{widerLabel}</span>
            <span className="block text-sm text-muted-foreground">
              {widerDescription}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </main>
  )
}
