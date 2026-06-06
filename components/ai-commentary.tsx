import { Sparkles } from "lucide-react"
import { fmtGBP, fmtWeekLong } from "@/lib/data"
import type { GroupSummary, SiteWeekRow, BarberWeekRow } from "@/lib/data"

function buildCommentary(
  summary: GroupSummary,
  sites: SiteWeekRow[],
  barbers: BarberWeekRow[],
): string {
  const parts: string[] = []
  const attain = summary.attainmentPct

  if (attain >= 100) {
    parts.push(
      `For week ending ${fmtWeekLong(summary.week)} the group traded ahead of plan at ${attain.toFixed(0)}% of target (${fmtGBP(summary.weekRevenue)}).`,
    )
  } else if (attain >= 90) {
    parts.push(
      `For week ending ${fmtWeekLong(summary.week)} the group landed broadly on plan at ${attain.toFixed(0)}% of target, ${fmtGBP(summary.weekTarget - summary.weekRevenue)} short of pace.`,
    )
  } else {
    parts.push(
      `For week ending ${fmtWeekLong(summary.week)} the group was behind plan at ${attain.toFixed(0)}% of target, a ${fmtGBP(summary.weekTarget - summary.weekRevenue)} gap.`,
    )
  }

  if (summary.prevWeek) {
    const dir = summary.wowPct >= 0 ? "up" : "down"
    parts.push(
      `That is ${dir} ${Math.abs(summary.wowPct).toFixed(0)}% week-on-week.`,
    )
  }

  const top = barbers.filter((b) => b.reported)[0]
  const laggards = barbers.filter((b) => b.reported && b.rag === "red")
  if (top) {
    parts.push(`${top.name} led the floor with ${fmtGBP(top.revenue)}.`)
  }
  if (laggards.length > 0) {
    parts.push(
      `${laggards.length} barber${laggards.length === 1 ? "" : "s"} finished below target and ${laggards.length === 1 ? "needs" : "need"} attention.`,
    )
  }

  const unconfirmed = summary.siteCount - summary.confirmedSites
  if (unconfirmed > 0) {
    parts.push(
      `${unconfirmed} site${unconfirmed === 1 ? "" : "s"} still awaiting functional-leader confirmation for this week.`,
    )
  } else if (summary.siteCount > 0) {
    parts.push("All sites have been confirmed by their functional leader.")
  }

  return parts.join(" ")
}

export function AiCommentary({
  summary,
  sites,
  barbers,
}: {
  summary: GroupSummary
  sites: SiteWeekRow[]
  barbers: BarberWeekRow[]
}) {
  const commentary = buildCommentary(summary, sites, barbers)
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">AI Commentary</span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/90">{commentary}</p>
    </div>
  )
}
