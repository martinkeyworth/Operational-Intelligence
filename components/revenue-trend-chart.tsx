"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { TrendPoint } from "@/lib/data"

export function RevenueTrendChart({ data }: { data: TrendPoint[] }) {
  const target = data[0]?.target ?? 0

  return (
    <ChartContainer
      config={{
        revenue: { label: "Takings", color: "var(--chart-1)" },
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
        {target > 0 && (
          <ReferenceLine
            y={target}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{
              value: "Target",
              position: "insideTopRight",
              fill: "var(--muted-foreground)",
              fontSize: 10,
            }}
          />
        )}
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [`£${Number(value).toLocaleString()}`, " Takings"]}
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
