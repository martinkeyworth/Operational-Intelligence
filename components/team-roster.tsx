"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { RagDot } from "@/components/rag"
import { ChevronRight, Link2, Link2Off, Search } from "lucide-react"
import type { TeamRosterMember } from "@/lib/team"

function StatusChip({
  label,
  tone,
}: {
  label: string
  tone: "ok" | "warn" | "muted"
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700"
        : "bg-muted text-muted-foreground"
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
}

export function TeamRoster({ roster }: { roster: TeamRosterMember[] }) {
  const [q, setQ] = useState("")

  const groups = useMemo(() => {
    const filtered = roster.filter((m) =>
      `${m.name} ${m.role} ${m.siteName}`.toLowerCase().includes(q.toLowerCase()),
    )
    const bySite = new Map<string, TeamRosterMember[]>()
    for (const m of filtered) {
      const arr = bySite.get(m.siteName) ?? []
      arr.push(m)
      bySite.set(m.siteName, arr)
    }
    return Array.from(bySite.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [roster, q])

  return (
    <div className="space-y-6">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search team…"
          className="pl-9 text-base"
        />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team members match.</p>
      ) : (
        groups.map(([site, members]) => (
          <section key={site} className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              {site}{" "}
              <span className="font-normal text-muted-foreground">({members.length})</span>
            </h2>
            <div className="grid gap-2.5 lg:grid-cols-2">
              {members.map((m) => (
                <Link key={m.id} href={`/admin/team/${m.id}`}>
                  <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                        {m.isApprentice && (
                          <Badge variant="secondary" className="text-[10px]">
                            Apprentice
                          </Badge>
                        )}
                        {m.linked ? (
                          <Link2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Login linked" />
                        ) : (
                          <Link2Off
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-label="No login linked"
                          />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.role}
                        {m.managerName ? ` · 1-2-1: ${m.managerName}` : " · no manager"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <RagDot rag={m.holidayRag} /> {m.holidayRemaining}d holiday
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <RagDot rag={m.sicknessRag} /> {m.sicknessDays}d sick
                        </span>
                        <StatusChip
                          label={`1-2-1: ${m.oneToOneStatus}`}
                          tone={
                            m.oneToOneStatus === "Completed"
                              ? "ok"
                              : m.oneToOneStatus === "None" || m.oneToOneStatus === "Missed"
                                ? "warn"
                                : "muted"
                          }
                        />
                        <StatusChip
                          label={m.threeSixtyOpen ? "360: open" : "360: none"}
                          tone={m.threeSixtyOpen ? "ok" : "muted"}
                        />
                        {m.apprenticeRag && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <RagDot rag={m.apprenticeRag} /> gate
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
