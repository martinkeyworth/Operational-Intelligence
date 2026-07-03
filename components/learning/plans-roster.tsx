import Link from "next/link"
import { formatPeriod } from "@/lib/learning-types"
import { pbcScoreLabel } from "@/components/learning/pbc-scale"
import { cn } from "@/lib/utils"

export type RosterRow = {
  barberId: number
  name: string
  role: string
  siteName: string
  targetRoleTitle: string
  planProgressPct: number
  reviewDue: boolean
  period: string
  oneToOneStatus: string
  pbcOverall: number | null
}

/** Leadership / manager roster of development plans + 1-2-1 status. */
export function PlansRoster({ rows }: { rows: RosterRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No active team members found.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Site</th>
            <th className="px-3 py-2 font-medium">Target role</th>
            <th className="px-3 py-2 font-medium">Plan</th>
            <th className="px-3 py-2 font-medium">This month&apos;s 1-2-1</th>
            <th className="px-3 py-2 text-center font-medium">PBC</th>
            <th className="px-3 py-2 font-medium sr-only">Open</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.barberId} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.role}</p>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{r.siteName}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.targetRoleTitle}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${r.planProgressPct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">{r.planProgressPct}%</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={r.oneToOneStatus} reviewDue={r.reviewDue} />
              </td>
              <td className="px-3 py-2 text-center">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {r.pbcOverall ?? "—"}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {r.pbcOverall ? pbcScoreLabel(r.pbcOverall) : formatPeriod(r.period)}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/learning/plans/${r.barberId}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status, reviewDue }: { status: string; reviewDue: boolean }) {
  const map: Record<string, string> = {
    Completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    Scheduled: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    None: "bg-muted text-muted-foreground border-border",
  }
  const label = status === "None" ? (reviewDue ? "Due" : "Not started") : status
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        map[status] ?? map.None,
      )}
    >
      {label}
    </span>
  )
}
