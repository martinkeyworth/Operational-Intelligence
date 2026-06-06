import { Card } from "@/components/ui/card"
import type { RecruitmentPlan } from "@/lib/hr"
import { UserPlus, AlertTriangle, CheckCircle2 } from "lucide-react"

export function RecruitmentPlanCard({ plan }: { plan: RecruitmentPlan }) {
  const gapSites = plan.sites.filter((s) => s.totalGap > 0)

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            Recruitment Plan
          </h2>
          <p className="text-xs text-muted-foreground">
            Role-by-role gap to the plan staffing model across all shops &amp;
            the Academy
          </p>
        </div>
        {plan.totalGap > 0 ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
            <AlertTriangle className="h-3 w-3" />
            {plan.totalGap} to recruit
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-rag-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-green">
            <CheckCircle2 className="h-3 w-3" />
            Fully staffed
          </span>
        )}
      </div>

      {/* Group totals by role */}
      <div className="mb-5 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-right font-medium">Have</th>
              <th className="px-3 py-2 text-right font-medium">Need</th>
              <th className="px-3 py-2 text-right font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {plan.byRole.map((r) => (
              <tr key={r.role} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-foreground">{r.role}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {r.have}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.need}
                </td>
                <td
                  className={
                    "px-3 py-2 text-right font-semibold tabular-nums " +
                    (r.gap > 0 ? "text-rag-red" : "text-rag-green")
                  }
                >
                  {r.gap > 0 ? `+${r.gap}` : "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-site breakdown for shops with a gap */}
      {gapSites.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            Shops needing recruitment
          </p>
          {gapSites.map((s) => (
            <div
              key={s.siteId}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {s.siteName}
                  <span className="text-muted-foreground"> · {s.brand}</span>
                </p>
                <span className="rounded-full bg-rag-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-amber">
                  {s.totalGap} needed
                </span>
              </div>
              {!s.rolesTracked && (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Headcount only — no per-role records yet, so gaps assume
                  staff are {s.cuttingRole}s.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {s.lines.map((l) => (
                  <span
                    key={l.role}
                    className={
                      "rounded-md border px-2 py-1 text-xs " +
                      (l.gap > 0
                        ? "border-rag-red/30 bg-rag-red/5 text-rag-red"
                        : "border-border text-muted-foreground")
                    }
                  >
                    {l.role}: {l.have}/{l.need}
                    {l.gap > 0 ? ` (+${l.gap})` : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Every shop meets the plan staffing model. No recruitment action
          required.
        </p>
      )}

      {/* Academy trainer/assessor demand */}
      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-xs font-medium text-foreground">
          Training Academy demand
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {plan.apprenticesHave} apprentices in post (target{" "}
          {plan.apprenticesNeed}) → needs {plan.trainersNeed} trainer
          {plan.trainersNeed === 1 ? "" : "s"} and {plan.assessorsNeed} assessor
          {plan.assessorsNeed === 1 ? "" : "s"} to support the cohort.
        </p>
      </div>
    </Card>
  )
}
