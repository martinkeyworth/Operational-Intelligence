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
import { fmtWeek } from "@/lib/format"
import type { TakingsPoint } from "@/lib/team"

/** A barber's own weekly takings (actual) vs the flat £500 RTB target line. */
export function BarberRtbChart({ data }: { data: TakingsPoint[] }) {
  const chartData = data.map((d) => ({
    label: fmtWeek(d.weekEnding),
    actual: d.actual,
    target: d.target,
  }))

  if (chartData.length === 0) {
    return (
      <div className="flex h-[240px] w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No takings recorded yet. Submit your first week to start tracking.
      </div>
    )
  }

  return (
    <ChartContainer
      config={{
        actual: { label: "Your takings", color: "var(--chart-1)" },
        target: { label: "£500 RTB target", color: "var(--chart-2)" },
      }}
      className="h-[240px] w-full"
    >
      <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
        <defs>
          <linearGradient id="barberRtbFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-actual)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-actual)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
          className="text-[11px]"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={44}
          tickFormatter={(v) => `£${v}`}
          className="text-[11px]"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                `£${Number(value).toLocaleString()}`,
                name === "actual" ? " Your takings" : " Target",
              ]}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="actual"
          name="actual"
          stroke="var(--color-actual)"
          strokeWidth={2}
          fill="url(#barberRtbFill)"
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
