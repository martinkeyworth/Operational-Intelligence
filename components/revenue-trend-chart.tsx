"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { TrendPoint } from "@/lib/data"

export function RevenueTrendChart({ data }: { data: TrendPoint[] }) {
  // Plot every week's actual takings against the operating target. The latest
  // week may still be in progress (submission deadline not yet passed); rather
  // than let its partial figure read as a collapse, we draw completed weeks as
  // a solid line and any in-progress tail as a dotted, provisional segment that
  // connects from the last completed week.
  const hasProvisional = data.some((d) => d.inProgress)
  const rows = data.map((d, i) => {
    const nextInProgress = Boolean(data[i + 1]?.inProgress)
    return {
      label: d.label,
      // Solid line: completed weeks only.
      actual: d.inProgress ? null : d.revenue,
      // Dotted line: the in-progress week(s) plus the last completed week
      // immediately before, so the two segments join up.
      provisional:
        d.inProgress || (!d.inProgress && nextInProgress) ? d.revenue : null,
      target: d.target,
    }
  })

  return (
    <div>
      <ChartContainer
        config={{
          actual: { label: "Actual takings", color: "var(--chart-1)" },
          provisional: { label: "Week in progress", color: "var(--chart-1)" },
          target: { label: "Operating target", color: "var(--chart-2)" },
        }}
        className="h-[260px] w-full"
      >
        <LineChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="var(--border)"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={20}
            className="text-[11px]"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={48}
            domain={[0, "auto"]}
            tickFormatter={(v) => `£${(Number(v) / 1000).toFixed(0)}k`}
            className="text-[11px]"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => [
                  `£${Number(value).toLocaleString()}`,
                  name === "actual"
                    ? " Actual"
                    : name === "provisional"
                      ? " In progress"
                      : " Target",
                ]}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            type="monotone"
            dataKey="actual"
            name="actual"
            stroke="var(--color-actual)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="provisional"
            name="provisional"
            stroke="var(--color-provisional)"
            strokeWidth={2}
            strokeDasharray="2 3"
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="target"
            name="target"
            stroke="var(--color-target)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        </LineChart>
      </ChartContainer>
      {hasProvisional && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Latest week is still being reported — shown as a dotted, provisional
          line, not a final result.
        </p>
      )}
    </div>
  )
}
