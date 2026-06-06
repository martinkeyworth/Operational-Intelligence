import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RagBadge, RagDot } from "@/components/rag"
import { fmtGBP, fmtWeekLong } from "@/lib/format"
import { getMonthlyRollup, getLatestAreaRags } from "@/lib/monthly"
import { CalendarRange, Store, TrendingUp } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function MonthlyReportPage() {
  const user = await requireDashboard()
  const [{ rows, latestWeek }, areaData] = await Promise.all([
    getMonthlyRollup(),
    getLatestAreaRags(),
  ])

  const latestMonth = rows[0] ?? null

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Reporting Cadence"
        title="Monthly Roll-Up"
        subtitle="The bridge between weekly inputs and the quarterly board summary — group turnover by month against the LTZ plan."
      >
        {latestMonth && (
          <RagBadge rag={latestMonth.rag} className="px-3 py-1 text-sm" />
        )}
      </PageHeader>

      <div className="space-y-6 px-5 py-6 md:px-8">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No weekly data has been entered yet, so there is nothing to roll up.
          </p>
        ) : (
          <>
            {/* Latest month headline */}
            {latestMonth && (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  label={`${latestMonth.label} turnover`}
                  value={fmtGBP(latestMonth.revenue)}
                  sub={`${latestMonth.weeks} week${latestMonth.weeks === 1 ? "" : "s"} of data`}
                />
                <StatCard
                  label="Plan target (month)"
                  value={fmtGBP(latestMonth.planTarget)}
                  sub="LTZ 2025–2030 plan"
                />
                <StatCard
                  label="Attainment"
                  value={`${latestMonth.attainmentPct}%`}
                  sub={<RagBadge rag={latestMonth.rag} />}
                />
                <StatCard
                  label="Latest data"
                  value={latestWeek ? `W/E ${fmtWeekLong(latestWeek)}` : "—"}
                />
              </div>
            )}

            {/* Monthly table */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                Turnover by month vs plan
              </h2>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Month</th>
                      <th className="px-4 py-2.5 text-right font-medium">Weeks</th>
                      <th className="px-4 py-2.5 text-right font-medium">Turnover</th>
                      <th className="px-4 py-2.5 text-right font-medium">Plan target</th>
                      <th className="px-4 py-2.5 text-right font-medium">Attainment</th>
                      <th className="px-4 py-2.5 text-center font-medium">RAG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{r.label}</div>
                          {r.openings.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <Store className="h-3 w-3" />
                              {r.openings.join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {r.weeks}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {fmtGBP(r.revenue)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {fmtGBP(r.planTarget)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {r.attainmentPct}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <RagDot rag={r.rag} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Latest area RAGs */}
            {areaData && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Functional area RAG · W/E {fmtWeekLong(areaData.week)}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {areaData.scorecard.areas.map((a) => (
                    <div
                      key={a.key}
                      className="rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="truncate text-xs font-medium text-foreground">
                          {a.label}
                        </p>
                        <RagDot rag={a.rag} />
                      </div>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {a.pct}%
                      </p>
                    </div>
                  ))}
                </div>
                {areaData.nextOpening && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Next planned opening:{" "}
                    <span className="font-medium text-foreground">
                      {areaData.nextOpening.tier} Brand · {areaData.nextOpening.location}
                    </span>
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
