"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Calendar } from "lucide-react"
import { fmtWeekLong } from "@/lib/data"

export function WeekSelector({
  weeks,
  current,
}: {
  weeks: string[]
  current: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("week", e.target.value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm">
      <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">Select week ending</span>
      <select
        value={current}
        onChange={onChange}
        className="bg-transparent pr-1 text-sm font-medium text-foreground outline-none"
      >
        {weeks.map((w) => (
          <option key={w} value={w} className="bg-popover text-popover-foreground">
            W/E {fmtWeekLong(w)}
          </option>
        ))}
      </select>
    </label>
  )
}
