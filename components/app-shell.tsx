"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { GROUP_BRAND } from "@/lib/brands"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Store,
  ListChecks,
  ClipboardEdit,
  Users,
  Percent,
  ShieldAlert,
  LayoutGrid,
  LifeBuoy,
  ClipboardCheck,
  CalendarRange,
  UserPlus,
  Gavel,
  UserSearch,
  GraduationCap,
  Activity,
  CalendarClock,
  Inbox,
  Mail,
  LogOut,
} from "lucide-react"

type ShellUser = {
  name: string
  email: string
  role?: string
  isCompany?: boolean
  isOwner?: boolean
  canViewDashboard?: boolean
  isBarber?: boolean
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode
  user: ShellUser
}) {
  const pathname = usePathname()
  const router = useRouter()

  const dashboardNav = user.canViewDashboard
    ? [
        { href: "/", label: "Group Overview", icon: LayoutDashboard },
        { href: "/continuity", label: "Continuity Briefing", icon: LifeBuoy },
        { href: "/sites", label: "Sites", icon: Store },
        { href: "/functions", label: "Functional Areas", icon: LayoutGrid },
        { href: "/reports/submissions", label: "Submissions", icon: ClipboardCheck },
        { href: "/reports/monthly", label: "Monthly Roll-Up", icon: CalendarRange },
        { href: "/reports/workforce", label: "Workforce Plan", icon: UserPlus },
        { href: "/actions", label: "Action Register", icon: ListChecks },
        { href: "/operations", label: "Risk Register", icon: ShieldAlert },
        { href: "/decisions", label: "Decision Register", icon: Gavel },
        { href: "/recruitment", label: "Recruitment Funnel", icon: UserSearch },
        { href: "/training-funnel", label: "Training Funnel", icon: GraduationCap },
        { href: "/activity", label: "Activity Tracker", icon: Activity },
        { href: "/cadence", label: "Review Cadence", icon: CalendarClock },
      ]
    : []
  const nav = [
    { href: "/my-work", label: "My Work", icon: Inbox },
    ...dashboardNav,
    // Weekly Takings is for data-entry users: barbers + any dashboard user.
    ...(user.isBarber || user.canViewDashboard
      ? [{ href: "/data-entry", label: "Weekly Takings", icon: ClipboardEdit }]
      : []),
    ...(user.isCompany && user.canViewDashboard
      ? [{ href: "/admin/people", label: "People & Access", icon: Users }]
      : []),
    ...(user.isOwner
      ? [{ href: "/admin/splits", label: "Profit Split", icon: Percent }]
      : []),
    ...(user.isOwner
      ? [{ href: "/admin/email", label: "Email Diagnostics", icon: Mail }]
      : []),
  ]

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <div className="min-h-svh bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
          <Image
            src={GROUP_BRAND.logo || "/placeholder.svg"}
            alt="LTZ Group International"
            width={36}
            height={36}
            className="h-9 w-9 rounded-md object-cover"
            priority
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-sidebar-foreground">
              LTZ Group
            </p>
            <p className="text-[11px] text-muted-foreground">Governance</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
              {initials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {user.name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground capitalize">
                {user.role ?? "Viewer"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={handleSignOut}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top nav */}
        <div className="md:hidden flex items-center justify-between border-b border-border px-4 h-14">
          <div className="flex items-center gap-2">
            <Image
              src={GROUP_BRAND.logo || "/placeholder.svg"}
              alt="LTZ Group International"
              width={32}
              height={32}
              className="h-8 w-8 rounded-md object-cover"
            />
            <span className="text-sm font-semibold">LTZ Group</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="md:hidden flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
