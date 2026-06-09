import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import Link from "next/link"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { RagBadge, RagDot } from "@/components/rag"
import { getWeeks } from "@/lib/data"
import { getSubmissionStatus } from "@/lib/submissions"
import { currentWeekEnding, previousWeekEnding } from "@/lib/reporting"
import type { Rag } from "@/lib/format"
import { CheckCircle2, Clock } from "lucide-react"
import { WeekPicker } from "@/components/week-picker"

function ragFor(s: { complete: boolean; pct: number }): Rag {
  return s.complete ? "green" : s.pct >= 75 ? "amber" : "red"
}

export const dynamic = "force-dynamic"

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const user = await requireDashboard()
  const { week: weekParam } = await searchParams

  // Anchor the board to the live reporting week, not whatever week happens to
  // have data. Always offer this week + last week so the two are comparable.
  const thisWeek = currentWeekEnding()
  const lastWeek = previousWeekEnding(thisWeek)
  const dataWeeks = await getWeeks()
  const weeks = Array.from(new Set([thisWeek, lastWeek, ...dataWeeks])).sort(
    (a, b) => (a < b ? 1 : -1),
  )
  const week = weekParam && weeks.includes(weekParam) ? weekParam : thisWeek

  // Headline status for the two relevant weeks (drives the quick switch).
  const [thisStatus, lastStatus] = await Promise.all([
    getSubmissionStatus(thisWeek),
    getSubmissionStatus(lastWeek),
  ])

  if (!week) {
    return (
      <AppShell user={user}>
        <PageHeader
          meta="Reporting Cadence"
          title="Weekly Submissions"
          subtitle="Track who has entered their weekly data."
        />
        <div className="px-5 py-6 md:px-8">
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No weekly data has been entered yet.
          </p>
        </div>
      </AppShell>
    )
  }

  const status = await getSubmissionStatus(week)
  const summaryRag: Rag = ragFor(status)

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Reporting Cadence"
        title="Weekly Submissions"
        subtitle="Who has entered their weekly data — and who's still outstanding ahead of the board report."
      >
        <RagBadge
          rag={summaryRag}
          label={
            status.complete
              ? "All in"
              : `${status.outstandingCount} outstanding`
          }
          className="px-3 py-1 text-sm"
        />
      </PageHeader>

      <div className="space-y-6 px-5 py-6 md:px-8">
        {/* This week vs last week quick switch */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "This week", wk: thisWeek, s: thisStatus },
            { label: "Last week", wk: lastWeek, s: lastStatus },
          ].map(({ label, wk, s }) => {
            const active = wk === week
            return (
              <Link
                key={wk}
                href={`/reports/submissions?week=${wk}`}
                aria-current={active ? "true" : undefined}
                className={`rounded-lg border p-4 transition-colors ${
                  active
                    ? "border-foreground bg-card"
                    : "border-border bg-card/50 hover:bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {label}
                  </p>
                  <RagDot rag={ragFor(s)} />
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {s.submittedCount}/{s.total}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.complete
                    ? "All in"
                    : `${s.outstandingCount} outstanding`}{" "}
                  · w/e {s.weekLabel}
                </p>
              </Link>
            )
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <WeekPicker weeks={weeks} current={week} basePath="/reports/submissions" />
          <p className="text-xs text-muted-foreground">
            W/E {status.weekLabel}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Submitted"
            value={`${status.submittedCount}/${status.total}`}
            sub={`${status.pct}% complete`}
          />
          <StatCard label="Outstanding" value={status.outstandingCount} />
          <StatCard
            label="Status"
            value={status.complete ? "Complete" : "In progress"}
          />
          <StatCard
            label="Alert at 18:00"
            value={status.complete ? "None" : "Sent"}
            sub="Leadership chase"
          />
        </div>

        {/* By category */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {status.byCategory.map((c) => {
            const done = c.submitted === c.total
            return (
              <div
                key={c.category}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">
                    {c.category}
                  </p>
                  <RagDot rag={done ? "green" : "amber"} />
                </div>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {c.submitted}/{c.total}
                </p>
              </div>
            )
          })}
        </div>

        {/* Outstanding list */}
        {status.outstanding.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-rag-amber" />
              Outstanding ({status.outstanding.length})
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {status.outstanding.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.label}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.ownerRole} · {item.detail}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {item.category}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Submitted list */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-rag-green" />
            Submitted ({status.submittedCount})
          </h2>
          {status.submittedCount === 0 ? (
            <p className="rounded-lg border border-border p-4 text-xs text-muted-foreground">
              Nothing submitted yet for this week.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {status.items
                .filter((i) => i.submitted)
                .map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.ownerRole} · {item.detail}
                      </p>
                    </div>
                    <RagDot rag="green" />
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}
