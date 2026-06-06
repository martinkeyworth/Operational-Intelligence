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
  return (
    <ChartContainer
      config={{
        revenue: { label: "Actual takings", color: "var(--chart-1)" },
        target: { label: "Target (capacity)", color: "var(--chart-2)" },
      }}
      className="h-[260px] w-full"
    >
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
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
                name === "revenue" ? " Actual" : " Target",
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
  )
}
