"use client"

import { useRouter } from "next/navigation"
import { fmtWeekLong } from "@/lib/format"

/** Small week selector that navigates to `${basePath}?week=…` on change. */
export function WeekPicker({
  weeks,
  current,
  basePath,
  paramName = "week",
}: {
  weeks: string[]
  current: string
  basePath: string
  paramName?: string
}) {
  const router = useRouter()

  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
      Week ending
      <select
        value={current}
        onChange={(e) =>
          router.push(`${basePath}?${paramName}=${e.target.value}`)
        }
        className="h-9 min-w-44 rounded-md border border-border bg-card px-3 text-sm text-foreground"
      >
        {weeks.map((w) => (
          <option key={w} value={w}>
            {fmtWeekLong(w)}
          </option>
        ))}
      </select>
    </label>
  )
}
