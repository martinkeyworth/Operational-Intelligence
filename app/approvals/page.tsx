import Link from "next/link"
import type { Metadata } from "next"
import { requireUser } from "@/lib/access"
import { getPendingHolidayApprovals } from "@/lib/team"
import { SignOutButton } from "@/components/sign-out-button"
import { ApprovalsList } from "./approvals-list"

export const metadata: Metadata = {
  title: "Holiday approvals · Less Than Zero",
}

export default async function ApprovalsPage() {
  const user = await requireUser()
  // Team admins (company + dashboard) can decide any request; everyone else
  // only sees their own direct reports' pending holiday.
  const isTeamAdmin = user.isCompany && user.canViewDashboard
  const pending = await getPendingHolidayApprovals(user.id, isTeamAdmin)

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Less Than Zero · Approvals
            </p>
            <div className="flex items-center gap-3">
              {user.canViewDashboard && (
                <Link
                  href="/"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Dashboard
                </Link>
              )}
              {user.isBarber && (
                <Link
                  href="/team"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Team Area
                </Link>
              )}
              <SignOutButton />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Holiday approvals
            </h1>
            <p className="text-pretty text-sm text-muted-foreground">
              {isTeamAdmin
                ? "Every pending holiday request across the group."
                : "Holiday requested by the people you manage. Our policy is one month's notice — short-notice requests are flagged as exceptions."}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        <ApprovalsList items={pending} />
      </div>
    </main>
  )
}
