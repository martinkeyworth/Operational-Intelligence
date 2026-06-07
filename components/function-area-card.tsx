import Link from "next/link"
import { Card } from "@/components/ui/card"
import { RagBadge, RagDot } from "@/components/rag"
import {
  Armchair,
  Banknote,
  Building2,
  GraduationCap,
  Users,
  Megaphone,
  Activity,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react"
import type { FunctionAreaSummary, AreaScore } from "@/lib/data"

const ICONS: Record<string, LucideIcon> = {
  Armchair,
  Banknote,
  Building2,
  GraduationCap,
  Users,
  Megaphone,
  Activity,
}

export function FunctionAreaCard({
  area,
  score,
}: {
  area: FunctionAreaSummary
  score?: AreaScore
}) {
  const Icon = ICONS[score?.icon ?? area.icon] ?? Armchair
  // Performance RAG comes from the weekly scorecard (KPI/operational); fall back
  // to the action-derived RAG if no score is available.
  const rag = score?.rag ?? area.rag

  return (
    <Link
      href={`/functions/${encodeURIComponent(area.key)}`}
      className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {area.label}
            </h2>
            <p className="text-xs text-muted-foreground">{area.ownerRole}</p>
          </div>
        </div>
        <RagBadge rag={rag} />
      </div>

      {score && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Weekly KPI score</span>
            <span className="font-semibold tabular-nums text-foreground">
              {score.pct}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={
                rag === "green"
                  ? "h-full rounded-full bg-rag-green"
                  : rag === "amber"
                    ? "h-full rounded-full bg-rag-amber"
                    : "h-full rounded-full bg-rag-red"
              }
              style={{ width: `${Math.max(4, Math.min(100, score.pct))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{score.detail}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5 text-foreground">
          <RagDot rag="red" />
          {area.red} red
        </span>
        <span className="flex items-center gap-1.5 text-foreground">
          <RagDot rag="amber" />
          {area.amber} amber
        </span>
        {area.overdue > 0 && (
          <span className="font-semibold text-rag-red">
            {area.overdue} overdue
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>{area.risks} risks</span>
        <span aria-hidden>·</span>
        <span>{area.issues} issues</span>
        <span aria-hidden>·</span>
        <span>{area.actionItems} actions</span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        {area.topIssue ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-rag-red">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{area.topIssue}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-rag-green">
            <CheckCircle2 className="h-3.5 w-3.5" />
            On track
          </span>
        )}
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}
