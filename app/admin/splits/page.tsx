import { requireOwner } from "@/lib/access"
import { getLatestWeek, getBarberSplits } from "@/lib/data"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { SplitRow } from "@/components/split-row"
import { DEFAULT_BARBER_PCT } from "@/lib/split-config"
import { fmtWeekLong } from "@/lib/format"
import { ShieldCheck } from "lucide-react"

export default async function SplitsPage() {
  const owner = await requireOwner()
  const week = await getLatestWeek()

  const rows = week ? await getBarberSplits(week) : []
  const unset = rows.filter((r) => r.hasData && r.barberPct == null)
  const needsReview = rows.filter(
    (r) => r.hasData && r.barberPct != null && !r.reviewedThisWeek,
  )

  // Order: unset first, then needing review, then the rest. Barbers with no
  // data yet go last.
  const ordered = [
    ...unset,
    ...needsReview,
    ...rows.filter((r) => r.hasData && r.barberPct != null && r.reviewedThisWeek),
    ...rows.filter((r) => !r.hasData),
  ]

  return (
    <AppShell user={owner}>
      <PageHeader
        meta="Owners only · Martin & Cosmin"
        title="Profit Split"
        subtitle={`Set each barber's % share (the business keeps the remainder). Confirm a barber's split once they've loaded their first week of data, then review weekly. Unset barbers use the ${DEFAULT_BARBER_PCT}% group default.`}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Secure area
        </span>
      </PageHeader>

      <div className="space-y-6 px-5 py-6 md:px-8">
        {week ? (
          <p className="text-sm text-muted-foreground">
            Reviewing week ending{" "}
            <span className="font-medium text-foreground">{fmtWeekLong(week)}</span>
            {" · "}
            <span className="text-foreground">{unset.length}</span> unset,{" "}
            <span className="text-foreground">{needsReview.length}</span> awaiting
            weekly review
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No takings have been reported yet.
          </p>
        )}

        <div className="space-y-2.5">
          {ordered.map((row) => (
            <SplitRow key={row.id} row={row} />
          ))}
        </div>
      </div>
    </AppShell>
  )
}
