"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ComposedChart,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import type { VisionYear } from "@/lib/vision"

export function VisionGlideChart({
  years,
  salesGoal,
}: {
  years: VisionYear[]
  salesGoal: number
}) {
  return (
    <ChartContainer
      config={{
        salesTarget: { label: "Sales target", color: "var(--chart-1)" },
        rtbTarget: { label: "RTB target", color: "var(--chart-2)" },
      }}
      className="h-[280px] w-full"
    >
      <ComposedChart data={years} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          className="text-[11px]"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={48}
          tickFormatter={(v) => `£${(v / 1_000_000).toFixed(1)}m`}
          className="text-[11px]"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                `£${Number(value).toLocaleString()}`,
                name === "salesTarget" ? " Sales" : " RTB",
              ]}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <ReferenceLine
          y={salesGoal}
          stroke="var(--color-salesTarget)"
          strokeDasharray="6 4"
          strokeOpacity={0.5}
          label={{
            value: `£${(salesGoal / 1_000_000).toFixed(0)}m goal`,
            position: "insideTopRight",
            fontSize: 11,
            fill: "var(--muted-foreground)",
          }}
        />
        <Bar
          dataKey="salesTarget"
          name="salesTarget"
          fill="var(--color-salesTarget)"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
        <Line
          type="monotone"
          dataKey="rtbTarget"
          name="rtbTarget"
          stroke="var(--color-rtbTarget)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
