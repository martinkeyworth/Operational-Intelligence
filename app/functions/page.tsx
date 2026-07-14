import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { FunctionAreaCard } from "@/components/function-area-card"
import { RagBadge } from "@/components/rag"
import {
  getFunctionAreaSummaries,
  getBusinessScorecard,
  getLeadershipDefaultWeek,
  fmtWeekLong,
} from "@/lib/data"

export default async function FunctionsPage() {
  const user = await requireDashboard()
  // Most recent COMPLETED week — not the in-progress week that a daily-takings
  // rollup can create, which would score every area against empty data.
  const week = await getLeadershipDefaultWeek()
  const [areas, scorecard] = await Promise.all([
    getFunctionAreaSummaries(),
    week ? getBusinessScorecard(week) : Promise.resolve(null),
  ])

  const scoreByKey = new Map(
    (scorecard?.areas ?? []).map((a) => [a.key, a]),
  )

  const totalOpen = areas.reduce((s, a) => s + a.open, 0)
  const greenAreas = (scorecard?.areas ?? []).filter(
    (a) => a.rag === "green",
  ).length
  const redAreas = (scorecard?.areas ?? []).filter((a) => a.rag === "red").length

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Functional Reporting"
        title="Functional Areas"
        subtitle="Every business function inputs weekly data, is scored against its KPIs, and rolls up to a single overall business RAG. Drill into any area to see its KPIs and manage actions."
      >
        {scorecard && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Business RAG · {scorecard.overallPct}%
            </span>
            <RagBadge rag={scorecard.overallRag} className="px-3 py-1 text-sm" />
          </div>
        )}
      </PageHeader>
      <div className="space-y-8 px-5 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Overall Business RAG"
            value={scorecard ? `${scorecard.overallPct}%` : "—"}
            sub={week ? `W/E ${fmtWeekLong(week)}` : "No data"}
          />
          <StatCard
            label="Areas On Track"
            value={`${greenAreas}/${scorecard?.areas.length ?? areas.length}`}
            sub="Green this week"
          />
          <StatCard label="Open Actions" value={totalOpen} />
          <StatCard
            label="Areas In The Red"
            value={redAreas}
            sub={redAreas > 0 ? "Need attention" : "All clear"}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <FunctionAreaCard
              key={area.key}
              area={area}
              score={scoreByKey.get(area.key)}
            />
          ))}
        </div>
      </div>
    </AppShell>
  )
}
