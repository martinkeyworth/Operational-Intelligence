import { Sparkles } from "lucide-react"
import type { GroupSummary, SiteRow, ActionRow } from "@/lib/data"

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
})

function buildCommentary(
  summary: GroupSummary,
  sites: SiteRow[],
  risks: ActionRow[],
): string {
  const sorted = [...sites].sort((a, b) => b.attainmentPct - a.attainmentPct)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const attain = summary.attainmentPct

  const parts: string[] = []

  if (attain >= 100) {
    parts.push(
      `The group is trading ahead of plan at ${attain.toFixed(0)}% of target (${GBP.format(summary.monthRevenue)}).`,
    )
  } else if (attain >= 90) {
    parts.push(
      `The group is broadly on plan at ${attain.toFixed(0)}% of target, ${GBP.format(summary.monthTarget - summary.monthRevenue)} short of pace.`,
    )
  } else {
    parts.push(
      `The group is behind plan at ${attain.toFixed(0)}% of target and needs intervention to recover ${GBP.format(summary.monthTarget - summary.monthRevenue)}.`,
    )
  }

  if (best && worst && best.id !== worst.id) {
    parts.push(
      `${best.name} leads at ${best.attainmentPct.toFixed(0)}%, while ${worst.name} is the primary drag at ${worst.attainmentPct.toFixed(0)}%.`,
    )
  }

  if (summary.escalatedActions > 0) {
    parts.push(
      `${summary.escalatedActions} action${summary.escalatedActions === 1 ? " has" : "s have"} been escalated to CEO level${risks[0] ? `, led by "${risks[0].title}".` : "."}`,
    )
  } else if (risks.length > 0) {
    parts.push(`Watch "${risks[0].title}" before it escalates.`)
  } else {
    parts.push("No items are currently escalated.")
  }

  return parts.join(" ")
}

export function AiCommentary({
  summary,
  sites,
  risks,
}: {
  summary: GroupSummary
  sites: SiteRow[]
  risks: ActionRow[]
}) {
  const commentary = buildCommentary(summary, sites, risks)
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">
          AI Commentary
        </span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/90">{commentary}</p>
    </div>
  )
}
