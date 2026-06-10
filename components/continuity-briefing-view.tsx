"use client"

import Link from "next/link"
import { RagDot, RagBadge } from "@/components/rag"
import { Card } from "@/components/ui/card"
import type { ContinuityBriefing } from "@/lib/continuity"
import {
  AlertTriangle,
  Clock,
  Target,
  ArrowRight,
  UserCircle2,
  CheckCircle2,
  ListChecks,
} from "lucide-react"

function dueLabel(a: ContinuityBriefing["overdueActions"][number]): string {
  if (a.daysOverdue <= 0) return a.dueDate ?? ""
  return `${a.daysOverdue} day${a.daysOverdue === 1 ? "" : "s"} overdue`
}

export function ContinuityBriefingView({ data }: { data: ContinuityBriefing }) {
  const c = data.counts

  return (
    <div className="space-y-6 px-5 py-6 md:px-8">
      {/* Summary band */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Business RAG
          </p>
          <div className="mt-2 flex items-center gap-2">
            <RagDot rag={data.overallRag} />
            <span className="text-2xl font-semibold tracking-tight">
              {data.overallPct}%
            </span>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Areas off track
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {c.areasOffTrack}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Objectives at risk
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {c.objectivesAtRisk}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Overdue actions
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-rag-red">
            {c.overdue}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Unassigned
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {c.unassigned}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* (1)(2)(3) What is off track + why + who owns recovery */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rag-amber" />
            <h2 className="text-sm font-semibold">What is off track &amp; why</h2>
          </div>
          {data.offTrackAreas.length === 0 ? (
            <EmptyState label="Every functional area is on track." />
          ) : (
            <ul className="space-y-3">
              {data.offTrackAreas.map((area) => (
                <li
                  key={area.key}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <RagDot rag={area.rag} />
                        <Link
                          href={`/functions/${area.key}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {area.label}
                        </Link>
                      </div>
                      {area.topIssue && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {area.topIssue}
                        </p>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <UserCircle2 className="h-3.5 w-3.5" />
                      {area.ownerRole}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    {area.red > 0 && (
                      <span className="rounded-full bg-rag-red/15 px-2 py-0.5 font-semibold text-rag-red">
                        {area.red} red
                      </span>
                    )}
                    {area.amber > 0 && (
                      <span className="rounded-full bg-rag-amber/15 px-2 py-0.5 font-semibold text-rag-amber">
                        {area.amber} amber
                      </span>
                    )}
                    {area.overdue > 0 && (
                      <span className="rounded-full bg-rag-red/15 px-2 py-0.5 font-semibold text-rag-red">
                        {area.overdue} overdue
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* (5) Strategic objectives at risk */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-rag-amber" />
            <h2 className="text-sm font-semibold">
              Strategic objectives at risk
            </h2>
          </div>
          {data.objectivesAtRisk.length === 0 ? (
            <EmptyState label="No strategic objective is currently at risk." />
          ) : (
            <ul className="space-y-3">
              {data.objectivesAtRisk.map((obj) => (
                <li
                  key={obj.key}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{obj.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {obj.headline}
                      </p>
                    </div>
                    <RagBadge rag={obj.rag} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UserCircle2 className="h-3.5 w-3.5" />
                      {obj.ownerRole}
                    </span>
                    {obj.overdueActions > 0 && (
                      <span className="font-semibold text-rag-red">
                        {obj.overdueActions} overdue
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* (4) Overdue actions */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-rag-red" />
            <h2 className="text-sm font-semibold">Overdue actions</h2>
          </div>
          {data.overdueActions.length === 0 ? (
            <EmptyState label="Nothing is past its due date." />
          ) : (
            <ul className="space-y-2">
              {data.overdueActions.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-rag-red/30 bg-rag-red/5 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {a.ownerLabel}
                      {a.siteName ? ` · ${a.siteName}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-rag-red/15 px-2 py-0.5 text-[11px] font-semibold text-rag-red">
                    {dueLabel(a)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* (6) What must happen next */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-foreground" />
            <h2 className="text-sm font-semibold">What must happen next</h2>
          </div>
          {data.nextActions.length === 0 ? (
            <EmptyState label="No open priorities — the register is clear." />
          ) : (
            <ol className="space-y-2">
              {data.nextActions.map((a, i) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {a.ownerLabel}
                      {a.siteName ? ` · ${a.siteName}` : ""}
                      {a.overdue
                        ? ` · ${dueLabel(a)}`
                        : a.escalated
                          ? " · escalated"
                          : ""}
                    </p>
                  </div>
                  <RagDot rag={a.rag} className="mt-1" />
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/governance?tab=actions"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          Open action register <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/functions"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          Functional areas <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-rag-green/30 bg-rag-green/5 p-3 text-sm text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 text-rag-green" />
      {label}
    </div>
  )
}
