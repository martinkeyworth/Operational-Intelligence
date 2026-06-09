"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Users, UsersRound, Percent, Mail } from "lucide-react"

type Tab = { href: string; label: string; icon: typeof Users }

export function AdminTabs({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname()

  // People & Team Area are open to all admins; Splits & Email are owner-only.
  const tabs: Tab[] = [
    { href: "/admin/people", label: "People & Access", icon: Users },
    { href: "/admin/team", label: "Team Area", icon: UsersRound },
    ...(isOwner
      ? [
          { href: "/admin/splits", label: "Profit Split", icon: Percent },
          { href: "/admin/email", label: "Email", icon: Mail },
        ]
      : []),
  ]

  return (
    <div className="border-b border-border px-5 md:px-8">
      <nav className="flex gap-1 overflow-x-auto" aria-label="Admin sections">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
