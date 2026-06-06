import { Card } from "@/components/ui/card"
import { VisionGlideChart } from "@/components/vision-glide-chart"
import { fmtGBP } from "@/lib/format"
import type { VisionGlidePath } from "@/lib/vision"

export function VisionPanel({ vision }: { vision: VisionGlidePath }) {
  const {
    salesGoal,
    rtbGoal,
    targetYear,
    barbersNeeded,
    currentHeadcount,
    rtbPerBarberWeekly,
    grossPerBarberWeekly,
    headcountCagrPct,
    years,
    sites,
  } = vision

  const progressPct =
    barbersNeeded > 0
      ? Math.min(100, Math.round((currentHeadcount / barbersNeeded) * 100))
      : 0

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {targetYear} Vision · {fmtGBP(salesGoal)} chair sales
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            {fmtGBP(salesGoal)} barbershop sales / {fmtGBP(rtbGoal)} RTB by{" "}
            {targetYear} at a fixed {fmtGBP(rtbPerBarberWeekly)}/barber/week RTB
            (~{fmtGBP(grossPerBarberWeekly)} gross). That backs out{" "}
            <span className="font-medium text-foreground">
              ~{barbersNeeded} barbers
            </span>{" "}
            on the floor. Training &amp; subletting income sit on top and are
            excluded from this goal.
          </p>
        </div>
        <div className="rounded-md bg-muted px-3 py-1.5 text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Implied headcount growth
          </p>
          <p className="text-sm font-semibold text-foreground">
            {headcountCagrPct}% / yr
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Barbers today" value={String(currentHeadcount)} />
        <Stat
          label={`${targetYear} barbers needed`}
          value={`~${barbersNeeded}`}
        />
        <Stat label={`${targetYear} sales goal`} value={fmtGBP(salesGoal)} />
        <Stat label={`${targetYear} RTB goal`} value={fmtGBP(rtbGoal)} />
      </div>

      {/* Progress to headcount goal */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Headcount progress to goal
          </span>
          <span className="font-medium text-foreground">
            {currentHeadcount} / {barbersNeeded} ({progressPct}%)
          </span>
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
                <th className="px-3 py-2 text-right font-medium">
                  Barbers needed
                </th>
                <th className="px-3 py-2 text-right font-medium">Sales</th>
                <th className="px-3 py-2 text-right font-medium">RTB</th>
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
                  <td className="px-3 py-2 text-right font-medium text-foreground">
                    {s.headcountTarget}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {fmtGBP(s.salesTarget)}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {fmtGBP(s.rtbTarget)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground text-pretty">
          Reaching ~{barbersNeeded} barbers will require growing chairs and/or
          opening new sites — allocation above is indicative, scaled to today&apos;s
          chair mix.
        </p>
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
