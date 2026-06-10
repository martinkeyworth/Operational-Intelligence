"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { GROUP_BRAND } from "@/lib/brands"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Store,
  ClipboardEdit,
  ShieldAlert,
  LayoutGrid,
  LifeBuoy,
  ClipboardCheck,
  CalendarRange,
  UserPlus,
  UserSearch,
  GraduationCap,
  Inbox,
  Settings,
  LogOut,
  Crown,
  Wrench,
  UserRound,
  ChevronDown,
  Map,
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

  // Nav is grouped into ~5 collapsible top-level sections so the list stays
  // short; submenus flow naturally from each section.
  type NavItem = { href: string; label: string; icon: typeof Inbox }
  type NavSection = { title: string; icon: typeof Inbox; items: NavItem[] }

  const canEnterData = user.isBarber || user.canViewDashboard
  const isAdmin = Boolean(user.isCompany && user.canViewDashboard)

  const sections: NavSection[] = [
    {
      title: "My Work",
      icon: Inbox,
      items: [
        { href: "/my-work", label: "My Work", icon: Inbox },
        ...(user.isBarber
          ? [{ href: "/team", label: "Team Area", icon: UserRound }]
          : []),
        ...(canEnterData
          ? [{ href: "/data-entry", label: "Weekly Takings", icon: ClipboardEdit }]
          : []),
      ],
    },
    ...(user.canViewDashboard
      ? [
          {
            title: "Leadership",
            icon: Crown,
            items: [
              { href: "/", label: "Group Overview", icon: LayoutDashboard },
              { href: "/roadmap", label: "Growth Roadmap", icon: Map },
              { href: "/continuity", label: "Continuity Briefing", icon: LifeBuoy },
              { href: "/reports/submissions", label: "Submissions", icon: ClipboardCheck },
              { href: "/reports/monthly", label: "Monthly Roll-Up", icon: CalendarRange },
            ],
          },
          {
            title: "Operational",
            icon: Wrench,
            items: [
              { href: "/sites", label: "Sites", icon: Store },
              { href: "/governance", label: "Governance", icon: ShieldAlert },
            ],
          },
          {
            title: "Functions",
            icon: LayoutGrid,
            items: [
              { href: "/functions", label: "Functional Areas", icon: LayoutGrid },
              { href: "/reports/workforce", label: "Workforce Plan", icon: UserPlus },
              { href: "/recruitment", label: "Recruitment Funnel", icon: UserSearch },
              { href: "/training-funnel", label: "Training Funnel", icon: GraduationCap },
            ],
          },
        ]
      : []),
    // All management lives behind a single Admin entry.
    ...(isAdmin
      ? [
          {
            title: "Admin",
            icon: Settings,
            items: [{ href: "/admin", label: "Admin", icon: Settings }],
          },
        ]
      : []),
  ].filter((s) => s.items.length > 0)

  // Which section a given path lives in (for active highlighting + auto-open).
  const isItemActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)
  const activeSectionTitle = sections.find((s) =>
    s.items.some((i) => isItemActive(i.href)),
  )?.title

  // Mobile uses a two-tier strip: a row of the ~5 section names, then the
  // sub-items of whichever section is selected. Defaults to the active one.
  const [mobileSection, setMobileSection] = useState<string>(
    () => activeSectionTitle ?? sections[0]?.title ?? "",
  )
  // Keep the selected mobile section in sync with the route. AppShell does not
  // remount on client-side navigation, so without this the second-tier strip
  // would keep showing a stale section's sub-items after navigating.
  useEffect(() => {
    if (activeSectionTitle) setMobileSection(activeSectionTitle)
  }, [activeSectionTitle])
  const mobileItems =
    sections.find((s) => s.title === mobileSection)?.items ?? []

  // Collapsible state: the section holding the current page starts open.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        sections.map((s) => [s.title, s.title === activeSectionTitle]),
      ),
  )
  const toggleSection = (title: string) =>
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }))
  // Auto-open the section containing the current page after navigation, while
  // preserving any sections the user manually opened/closed.
  useEffect(() => {
    if (activeSectionTitle) {
      setOpenSections((prev) => ({ ...prev, [activeSectionTitle]: true }))
    }
  }, [activeSectionTitle])

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
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {sections.map((section) => {
            const SectionIcon = section.icon
            const isOpen = openSections[section.title] ?? false
            // Single-item sections (e.g. Admin) render as a direct link, no toggle.
            if (section.items.length === 1) {
              const item = section.items[0]
              const active = isItemActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={section.title}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {section.title}
                </Link>
              )
            }
            return (
              <div key={section.title} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  aria-expanded={isOpen}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    section.title === activeSectionTitle && !isOpen
                      ? "text-sidebar-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <SectionIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{section.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="mt-1 flex flex-col gap-1 pl-4">
                    {section.items.map((item) => {
                      const active = isItemActive(item.href)
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
                  </div>
                )}
              </div>
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
        {/* Mobile section tabs (top tier) — tapping navigates to the section's
            landing page and selects it, so each section shows distinct content. */}
        <div className="md:hidden flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
          {sections.map((section) => {
            const SectionIcon = section.icon
            const selected = section.title === mobileSection
            const hasActive = section.title === activeSectionTitle
            const landingHref = section.items[0]?.href ?? "/"
            return (
              <Link
                key={section.title}
                href={landingHref}
                onClick={() => setMobileSection(section.title)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  selected
                    ? "bg-sidebar-accent text-foreground"
                    : hasActive
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                <SectionIcon className="h-4 w-4" />
                {section.title}
              </Link>
            )
          })}
        </div>
        {/* Mobile sub-items (second tier) — hidden when section has a single item */}
        {mobileItems.length > 1 && (
          <div className="md:hidden flex gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-2">
            {mobileItems.map((item) => {
              const active = isItemActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium",
                    active
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
