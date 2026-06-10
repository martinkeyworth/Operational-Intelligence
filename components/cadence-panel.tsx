"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { CalendarClock, ArrowRight, CheckCircle2 } from "lucide-react"
import type { ReviewCeremony } from "@/lib/cadence"

export type CadenceCeremony = ReviewCeremony

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function dueLabel(c: CadenceCeremony): string {
  if (c.dueToday) return "Due today"
  if (c.daysUntil === 1) return "Tomorrow"
  return `in ${c.daysUntil} days`
}

const accent: Record<string, string> = {
  weekly: "border-l-rag-green",
  fortnightly: "border-l-rag-amber",
  quarterly: "border-l-primary",
}

/**
 * The layered review rhythm — weekly reporting, fortnightly leadership reviews
 * and quarterly strategy. Rendered as the Cadence tab of the Governance hub.
 */
export function CadencePanel({ cadence }: { cadence: CadenceCeremony[] }) {
  return (
    <div className="space-y-5">
      {cadence.map((c) => (
        <Card
          key={c.key}
          className={`border-l-4 ${accent[c.key] ?? "border-l-border"} p-5`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  {c.title}
                </h2>
                {c.dueToday && (
                  <span className="rounded-full bg-rag-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-amber">
                    Due today
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
                {c.description}
              </p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Owner: {c.owner}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-5 text-sm">
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Last
                </p>
                <p className="font-medium tabular-nums text-foreground">
                  {fmtDate(c.last)}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Next
                </p>
                <p className="font-medium tabular-nums text-foreground">
                  {fmtDate(c.next)}
                </p>
                <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="h-3 w-3" />
                  {dueLabel(c)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Standing agenda
            </h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {c.agenda.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-pretty">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {c.key === "weekly" && (
            <Link
              href={`/reports/${c.last}`}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              Open this week&apos;s board report
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </Card>
      ))}
    </div>
  )
}
