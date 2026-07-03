"use client"

import { formatPeriod } from "@/lib/learning-types"
import { pbcScoreLabel } from "@/components/learning/pbc-scale"
import { cn } from "@/lib/utils"

export type PbcHistoryRow = {
  period: string
  performance: number | null
  behaviours: number | null
  contribution: number | null
  overall: number | null
  ratedByName: string | null
  comment: string | null
}

/**
 * Monthly PBC history table (1 best – 5 lowest). Shows the trend over time so
 * both manager and barber can see improving or declining scores. An arrow marks
 * the movement in Overall vs the previous (older) period.
 */
export function PbcHistory({ history }: { history: PbcHistoryRow[] }) {
  if (history.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No PBC ratings yet. Scores appear here once a monthly 1-2-1 is completed.
      </p>
    )
  }

  // history arrives newest-first; compute movement vs the next (older) row.
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Period</th>
            <th className="px-3 py-2 text-center font-medium">Perf.</th>
            <th className="px-3 py-2 text-center font-medium">Behav.</th>
            <th className="px-3 py-2 text-center font-medium">Contrib.</th>
            <th className="px-3 py-2 text-center font-medium">Overall</th>
            <th className="px-3 py-2 font-medium">Rated by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {history.map((row, i) => {
            const older = history[i + 1]
            // Lower is better, so a decrease in the number is an improvement.
            const delta =
              older?.overall != null && row.overall != null ? older.overall - row.overall : null
            return (
              <tr key={row.period} className="align-top">
                <td className="px-3 py-2 font-medium text-foreground">{formatPeriod(row.period)}</td>
                <Cell score={row.performance} />
                <Cell score={row.behaviours} />
                <Cell score={row.contribution} />
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base font-semibold tabular-nums text-foreground">
                      {row.overall ?? "—"}
                    </span>
                    {delta != null && delta !== 0 ? (
                      <span
                        className={cn(
                          "text-xs font-medium",
                          delta > 0 ? "text-emerald-600" : "text-destructive",
                        )}
                        title={delta > 0 ? "Improved vs previous" : "Declined vs previous"}
                      >
                        {delta > 0 ? "▲" : "▼"}
                        {Math.abs(delta)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.ratedByName ?? "—"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ score }: { score: number | null }) {
  return (
    <td className="px-3 py-2 text-center">
      <span className="text-sm font-medium tabular-nums text-foreground">{score ?? "—"}</span>
      <span className="block text-[10px] text-muted-foreground">{score ? pbcScoreLabel(score) : ""}</span>
    </td>
  )
}
