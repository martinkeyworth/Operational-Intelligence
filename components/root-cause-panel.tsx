"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Brain, Plus, Check, AlertCircle } from "lucide-react"
import {
  generateRootCause,
  addRecommendedAction,
} from "@/app/reports/root-cause-actions"
import type { RootCauseAnalysis, RecommendedAction } from "@/lib/reporting"

const priorityStyles: Record<string, string> = {
  High: "bg-rag-red/15 text-rag-red",
  Medium: "bg-rag-amber/15 text-rag-amber",
  Low: "bg-rag-green/15 text-rag-green",
}

function RecommendedActionRow({ rec }: { rec: RecommendedAction }) {
  const [added, setAdded] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              priorityStyles[rec.priority] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {rec.priority}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {rec.functionArea} · {rec.owner}
          </span>
        </div>
        <p className="mt-1 text-sm font-medium text-foreground text-pretty">
          {rec.title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground text-pretty">
          {rec.rationale}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={added ? "secondary" : "default"}
        disabled={pending || added}
        onClick={() => {
          const fd = new FormData()
          fd.set("title", rec.title)
          fd.set("functionArea", rec.functionArea)
          fd.set("rationale", rec.rationale)
          fd.set("priority", rec.priority)
          fd.set("owner", rec.owner)
          startTransition(async () => {
            await addRecommendedAction(fd)
            setAdded(true)
          })
        }}
        className="shrink-0"
      >
        {added ? (
          <>
            <Check className="mr-1 h-3.5 w-3.5" /> Added
          </>
        ) : pending ? (
          "Adding…"
        ) : (
          <>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add to register
          </>
        )}
      </Button>
    </div>
  )
}

export function RootCausePanel({ weekEnding }: { weekEnding: string }) {
  const [result, setResult] = useState<RootCauseAnalysis | null>(null)
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            AI root-cause &amp; recommended actions
          </h2>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setError(false)
            startTransition(async () => {
              try {
                const r = await generateRootCause(weekEnding)
                setResult(r)
                if (r.recommendedActions.length === 0 && !r.summary) {
                  setError(true)
                }
              } catch {
                setError(true)
              }
            })
          }}
        >
          {pending ? "Analysing…" : result ? "Re-run analysis" : "Run analysis"}
        </Button>
      </div>

      <div className="px-5 py-4">
        {!result && !pending && !error && (
          <p className="text-sm text-muted-foreground">
            Diagnose the likely root causes behind this week&apos;s
            underperforming areas and turn them into assignable actions.
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-rag-red">
            <AlertCircle className="h-4 w-4" />
            Could not generate the analysis. Please try again.
          </div>
        )}

        {result && !error && (
          <div className="space-y-5">
            {result.summary && (
              <p className="text-sm leading-relaxed text-foreground text-pretty">
                {result.summary}
              </p>
            )}

            {result.rootCauses.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Root causes
                </h3>
                <div className="space-y-2">
                  {result.rootCauses.map((rc, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border bg-muted/30 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {rc.area}
                      </p>
                      <p className="mt-0.5 text-sm text-foreground text-pretty">
                        {rc.cause}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground text-pretty">
                        Evidence: {rc.evidence}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.recommendedActions.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recommended actions
                </h3>
                <div className="divide-y divide-border rounded-md border border-border">
                  {result.recommendedActions.map((rec, i) => (
                    <RecommendedActionRow key={i} rec={rec} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
