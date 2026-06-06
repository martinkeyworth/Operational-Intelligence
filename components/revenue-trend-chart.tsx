"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { RevenueTrendPoint } from "@/lib/data"

export function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    }),
  }))

  return (
    <ChartContainer
      config={{
        revenue: { label: "Revenue", color: "var(--chart-1)" },
      }}
      className="h-[240px] w-full"
    >
      <AreaChart data={formatted} margin={{ left: 4, right: 12, top: 8 }}>
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
          minTickGap={28}
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
              formatter={(value) => [`£${Number(value).toLocaleString()}`, " Revenue"]}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          fill="url(#revFill)"
        />
      </AreaChart>
    </ChartContainer>
  )
}
