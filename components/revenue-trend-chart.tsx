"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { TrendPoint } from "@/lib/data"

export function RevenueTrendChart({ data }: { data: TrendPoint[] }) {
  // A trailing "in progress" week (deadline not yet passed) would otherwise
  // plot as a completed point diving toward zero, reading as a collapse. We
  // split the series so completed weeks are a solid area and any provisional
  // week is drawn as a separate dotted line that connects from the last
  // completed week — clearly signalled as not-yet-final.
  const hasProvisional = data.some((d) => d.inProgress)
  const rows = data.map((d, i) => {
    const prev = data[i - 1]
    // The dotted "provisional" line covers in-progress weeks plus the last
    // completed week immediately before them, so the segments connect.
    const isProvisional = d.inProgress
    const isJoin = !d.inProgress && Boolean(data[i + 1]?.inProgress)
    return {
      label: d.label,
      // Solid actuals stop at the last completed week.
      revenue: d.inProgress ? null : d.revenue,
      // Dotted provisional line spans the join week + the in-progress week(s).
      provisional: isProvisional || isJoin ? d.revenue : null,
      target: d.target,
      _prevLabel: prev?.label,
    }
  })

  return (
    <div>
      <ChartContainer
        config={{
          revenue: { label: "Actual takings", color: "var(--chart-1)" },
          provisional: { label: "Week in progress", color: "var(--chart-1)" },
          target: { label: "Operating target", color: "var(--chart-2)" },
        }}
        className="h-[260px] w-full"
      >
        <AreaChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
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
            tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
            className="text-[11px]"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => [
                  `£${Number(value).toLocaleString()}`,
                  name === "revenue"
                    ? " Actual"
                    : name === "provisional"
                      ? " In progress"
                      : " Target",
                ]}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            type="monotone"
            dataKey="revenue"
            name="revenue"
            stroke="var(--color-revenue)"
            strokeWidth={2}
            fill="url(#revFill)"
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="provisional"
            name="provisional"
            stroke="var(--color-revenue)"
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
        </AreaChart>
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
