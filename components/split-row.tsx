"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { fmtGBP } from "@/lib/format"
import { setBarberSplit } from "@/app/admin/splits/actions"
import type { BarberSplitRow } from "@/lib/data"

export function SplitRow({ row }: { row: BarberSplitRow }) {
  const router = useRouter()
  const [pct, setPct] = useState<string>(
    row.barberPct == null ? "" : String(row.barberPct),
  )
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  const parsed = pct === "" ? row.effectiveBarberPct : Number(pct)
  const business = Number.isFinite(parsed) ? 100 - parsed : 0
  const barberCut = (row.weekTakings * (Number.isFinite(parsed) ? parsed : 0)) / 100
  const businessCut = row.weekTakings - barberCut

  async function action(formData: FormData) {
    setPending(true)
    setSaved(false)
    try {
      await setBarberSplit(formData)
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between"
    >
      <input type="hidden" name="id" value={row.id} />

      <div className="min-w-0 md:w-56">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {row.name}
          </p>
          {row.barberPct == null ? (
            <Badge variant="destructive" className="text-[10px]">
              Unset
            </Badge>
          ) : !row.reviewedThisWeek ? (
            <Badge variant="secondary" className="text-[10px]">
              Review
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {row.siteName} · {row.role}
        </p>
      </div>

      {!row.hasData ? (
        <p className="text-xs text-muted-foreground md:flex-1">
          No data loaded yet — split can be set after the first week is entered.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 md:flex-1">
            <label className="text-xs text-muted-foreground" htmlFor={`pct-${row.id}`}>
              Barber %
            </label>
            <Input
              id={`pct-${row.id}`}
              name="barberPct"
              type="number"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder={String(row.effectiveBarberPct)}
              className="h-9 w-20"
            />
            <span className="text-xs text-muted-foreground">
              / Business {Number.isFinite(business) ? business : "—"}%
            </span>
          </div>

          <div className="text-xs text-muted-foreground md:w-44 md:text-right">
            {row.weekTakings > 0 ? (
              <>
                <span className="text-foreground">{fmtGBP(barberCut)}</span> barber ·{" "}
                {fmtGBP(businessCut)} business
              </>
            ) : (
              "No takings this week"
            )}
          </div>
        </>
      )}

      {row.hasData && (
        <Button
          type="submit"
          size="sm"
          disabled={pending || pct === ""}
          className="h-9 gap-1.5 md:w-28"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {pending ? "Saving…" : saved ? "Saved" : "Set split"}
        </Button>
      )}
    </form>
  )
}
