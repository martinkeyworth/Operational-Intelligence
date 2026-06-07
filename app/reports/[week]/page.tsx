import Link from "next/link"
import { eq } from "drizzle-orm"
import { requireDashboard } from "@/lib/access"
import { db } from "@/lib/db"
import { weeklyReports } from "@/lib/db/schema"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { RagBadge } from "@/components/rag"
import { NarrativeForm } from "@/components/narrative-form"
import { RootCausePanel } from "@/components/root-cause-panel"
import { buildComparison } from "@/lib/reporting"
import { fmtWeekLong, type Rag } from "@/lib/data"
import {
  saveCosminNarrative,
  saveMartinResponse,
} from "@/app/reports/narrative-actions"
import { ArrowLeft } from "lucide-react"

function Prose({ text }: { text: string | null }) {
  if (!text)
    return (
      <p className="text-sm italic text-muted-foreground">Not yet submitted.</p>
    )
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="text-pretty">
          {p}
        </p>
      ))}
    </div>
  )
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ week: string }>
}) {
  const { week } = await params
  const user = await requireDashboard()

  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.weekEnding, week))

  const { rows, current } = await buildComparison(week)
  const overallRag = (report?.overallRag ?? current.overallRag) as Rag
  const overallPct = report?.overallPct ?? current.overallPct

  const isCosmin = user.email.toLowerCase().startsWith("cosmin@")
  const isMartin = user.email.toLowerCase().startsWith("martin@")

  return (
    <AppShell user={user}>
      <PageHeader
        meta={`Weekly board report · w/e ${fmtWeekLong(week)}`}
        title="Weekly Board Report"
        subtitle="AI week-on-week analysis, leadership narrative and the overall business RAG."
      >
        <div className="flex items-center gap-3">
          <RagBadge rag={overallRag} className="px-3 py-1 text-sm" />
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {overallPct}%
          </span>
        </div>
      </PageHeader>

      <div className="space-y-6 px-5 py-6 md:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Area scorecard — week on week
            </h2>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div
                key={r.area}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <span className="font-medium text-foreground">{r.area}</span>
                <div className="flex items-center gap-4">
                  <span className="tabular-nums text-foreground">
                    {r.currPct}%
                  </span>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">
                    {r.prevPct === null ? "—" : `${r.prevPct}%`}
                  </span>
                  <span
                    className={`w-20 text-right text-xs font-medium capitalize ${
                      r.trend === "improving"
                        ? "text-green-600"
                        : r.trend === "declining"
                          ? "text-red-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {r.trend}
                  </span>
                  <RagBadge rag={r.currRag as Rag} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">
            AI week-on-week analysis
          </h2>
          <div className="mt-3">
            <Prose text={report?.aiAnalysis ?? null} />
          </div>
          {!report?.aiAnalysis && (
            <p className="mt-2 text-xs text-muted-foreground">
              The analysis is generated automatically each Saturday at 6:50pm.
            </p>
          )}
        </Card>

        <RootCausePanel weekEnding={week} />

        <div className="grid gap-6 md:grid-cols-2">
          {isCosmin || user.isOwner ? (
            <NarrativeForm
              weekEnding={week}
              field="narrative"
              label="COO narrative (Cosmin)"
              placeholder="Add your narrative to accompany the AI analysis…"
              initialValue={report?.cosminNarrative ?? null}
              action={saveCosminNarrative}
            />
          ) : (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-foreground">
                COO narrative (Cosmin)
              </h3>
              <div className="mt-3">
                <Prose text={report?.cosminNarrative ?? null} />
              </div>
            </Card>
          )}

          {isMartin || user.isOwner ? (
            <NarrativeForm
              weekEnding={week}
              field="response"
              label="CEO response (Martin)"
              placeholder="Add your response to the analysis and narrative…"
              initialValue={report?.martinResponse ?? null}
              action={saveMartinResponse}
            />
          ) : (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-foreground">
                CEO response (Martin)
              </h3>
              <div className="mt-3">
                <Prose text={report?.martinResponse ?? null} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  )
}
