import { fmtGBP, type Rag } from "@/lib/format"
import { RagBadge } from "@/components/rag"
import type { VisionMonthlyPlan } from "@/lib/vision"

const ROW_TINT: Record<Rag, string> = {
  green: "",
  amber: "",
  red: "bg-rag-red/5",
}

const PCT_TEXT: Record<Rag, string> = {
  green: "text-rag-green",
  amber: "text-rag-amber",
  red: "text-rag-red",
}

export function VisionMonthlyTable({ plan }: { plan: VisionMonthlyPlan }) {
  const {
    year,
    months,
    annualRequired,
    annualActual,
    annualAttainmentPct,
    annualRag,
    startHeadcount,
    endHeadcount,
  } = plan

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {year} required takings by month · path to £5m
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            YTD {fmtGBP(annualActual)} / {fmtGBP(annualRequired)}
          </span>
          <RagBadge
            rag={annualRag}
            label={`${annualAttainmentPct}% attainment`}
          />
        </div>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
        Headcount ramps from {startHeadcount} to {endHeadcount} barbers across{" "}
        {year} at ~£1k gross/barber/week. Required takings grow with it; RAG
        compares actual chair sales to the monthly requirement (green ≥ 100%,
        amber within 10%, red below).
      </p>

      <div className="mt-2 overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 text-right font-medium">Barbers</th>
              <th className="px-3 py-2 text-right font-medium">Required</th>
              <th className="px-3 py-2 text-right font-medium">Actual</th>
              <th className="px-3 py-2 text-right font-medium">Attainment</th>
              <th className="px-3 py-2 text-center font-medium">RAG</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr
                key={m.month}
                className={`border-t border-border ${m.isPast ? ROW_TINT[m.rag] : "opacity-60"}`}
              >
                <td className="px-3 py-2 font-medium text-foreground">
                  {m.label}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {m.barbersNeeded}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {fmtGBP(m.requiredTakings)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {m.isPast ? fmtGBP(m.actualTakings) : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium ${m.isPast ? PCT_TEXT[m.rag] : "text-muted-foreground"}`}
                >
                  {m.isPast ? `${m.attainmentPct}%` : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  {m.isPast ? (
                    <RagBadge rag={m.rag} label="" className="px-1.5" />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Pending
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
