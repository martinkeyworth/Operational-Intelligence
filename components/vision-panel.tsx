import { Card } from "@/components/ui/card"
import { VisionGlideChart } from "@/components/vision-glide-chart"
import { fmtGBP } from "@/lib/format"
import type { VisionGlidePath } from "@/lib/vision"

export function VisionPanel({ vision }: { vision: VisionGlidePath }) {
  const {
    salesGoal,
    rtbGoal,
    targetYear,
    currentAnnualisedSales,
    cagrPct,
    years,
    sites,
  } = vision

  const progressPct =
    salesGoal > 0
      ? Math.min(100, Math.round((currentAnnualisedSales / salesGoal) * 100))
      : 0

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {targetYear} Vision · {fmtGBP(salesGoal)} sales
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Glide path to {fmtGBP(salesGoal)} annual sales and{" "}
            {fmtGBP(rtbGoal)} RTB by {targetYear}, worked back to per-site and
            per-barber weekly RTB targets.
          </p>
        </div>
        <div className="rounded-md bg-muted px-3 py-1.5 text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Implied growth
          </p>
          <p className="text-sm font-semibold text-foreground">
            {cagrPct}% / yr
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Current run-rate" value={fmtGBP(currentAnnualisedSales)} />
        <Stat label={`${targetYear} sales goal`} value={fmtGBP(salesGoal)} />
        <Stat label={`${targetYear} RTB goal`} value={fmtGBP(rtbGoal)} />
      </div>

      {/* Progress to goal */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progress to goal</span>
          <span className="font-medium text-foreground">{progressPct}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--chart-1)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="mt-5">
        <VisionGlideChart years={years} salesGoal={salesGoal} />
      </div>

      {/* Per-site worked-back targets */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {targetYear} targets by site (allocated by chair capacity)
        </h3>
        <div className="mt-2 overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Site</th>
                <th className="px-3 py-2 text-right font-medium">Chairs</th>
                <th className="px-3 py-2 text-right font-medium">Sales</th>
                <th className="px-3 py-2 text-right font-medium">RTB</th>
                <th className="px-3 py-2 text-right font-medium">RTB / barber / wk</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.siteId} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {s.name}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {s.chairs}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {fmtGBP(s.salesTarget)}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {fmtGBP(s.rtbTarget)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">
                    {fmtGBP(s.rtbPerBarberWeekly)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}
