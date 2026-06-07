import { RagBadge } from "@/components/rag"
import type { KpiResult } from "@/lib/data"

/** Read-only weekly KPI scorecard for a functional area. */
export function KpiScorecard({ kpis }: { kpis: KpiResult[] }) {
  if (kpis.length === 0) return null

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">KPI</th>
            <th className="px-4 py-2.5 font-medium">Owner</th>
            <th className="px-4 py-2.5 text-right font-medium">This week</th>
            <th className="px-4 py-2.5 text-right font-medium">Target</th>
            <th className="px-4 py-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {kpis.map((k) => {
            const targetLabel =
              k.direction === "higher_better"
                ? `≥ ${k.green}`
                : `≤ ${k.green}`
            return (
              <tr key={k.code} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{k.name}</p>
                  <p className="text-xs text-muted-foreground">{k.unit}</p>
                </td>
                <td className="px-4 py-3 text-foreground">{k.owner}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                  {k.entered ? k.value : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {targetLabel}
                </td>
                <td className="px-4 py-3 text-right">
                  {k.entered ? (
                    <RagBadge rag={k.rag} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not reported
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
