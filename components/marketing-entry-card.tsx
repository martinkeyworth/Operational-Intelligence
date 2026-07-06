"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RagDot } from "@/components/rag"
import { saveKpiValue } from "@/app/data-entry/kpi-actions"
import type { Rag } from "@/lib/format"

export type MarketingEntryKpi = {
  code: string
  name: string
  unit: string
  help: string
  value: number | null
  green: number
  amber: number
  direction: "higher_better" | "lower_better"
  noAmber?: boolean
}

function previewRag(k: MarketingEntryKpi, n: number): Rag {
  if (k.noAmber) {
    return k.direction === "higher_better"
      ? n >= k.green
        ? "green"
        : "red"
      : n <= k.green
        ? "green"
        : "red"
  }
  if (k.direction === "higher_better") {
    if (n >= k.green) return "green"
    if (n >= k.amber) return "amber"
    return "red"
  }
  if (n <= k.green) return "green"
  if (n <= k.amber) return "amber"
  return "red"
}

function targetLabel(k: MarketingEntryKpi): string {
  if (k.noAmber) return `Green ≥ ${k.green} ${k.unit} · below is red (no amber)`
  return k.direction === "higher_better"
    ? `Green ≥ ${k.green} ${k.unit} · Amber ≥ ${k.amber}`
    : `Green ≤ ${k.green} ${k.unit} · Amber ≤ ${k.amber}`
}

function EntryRow({
  kpi,
  week,
  siteId,
}: {
  kpi: MarketingEntryKpi
  week: string
  siteId: number
}) {
  const router = useRouter()
  const [value, setValue] = useState(kpi.value === null ? "" : String(kpi.value))
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  const num = value.trim() === "" ? null : Number(value)
  const rag = num === null || Number.isNaN(num) ? null : previewRag(kpi, num)

  async function onSave(formData: FormData) {
    setPending(true)
    setSaved(false)
    try {
      await saveKpiValue(formData)
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      action={onSave}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="code" value={kpi.code} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="siteId" value={siteId} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {rag && <RagDot rag={rag} />}
          <p className="text-sm font-medium text-foreground">{kpi.name}</p>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{kpi.help}</p>
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">
          {targetLabel(kpi)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          name="value"
          type="number"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="—"
          aria-label={`${kpi.name} value`}
          className="h-11 w-28 text-base"
        />
        <Button type="submit" disabled={pending} className="h-11 min-w-[84px]">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <>
              <Check className="mr-1 h-4 w-4" />
              Saved
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </form>
  )
}

/**
 * Per-site social & reviews entry. Site managers enter their own site's
 * platform posts + Google/booking ratings here; Ravi enters the academy's posts
 * + free haircuts. Each value saves independently and is scored live.
 */
export function MarketingEntryCard({
  week,
  siteId,
  kpis,
}: {
  week: string
  siteId: number
  kpis: MarketingEntryKpi[]
}) {
  return (
    <div className="flex flex-col gap-3">
      {kpis.map((kpi) => (
        <EntryRow key={kpi.code} kpi={kpi} week={week} siteId={siteId} />
      ))}
    </div>
  )
}
