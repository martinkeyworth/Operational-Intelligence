"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RagDot } from "@/components/rag"
import { scoreKpi, type KpiDef } from "@/lib/kpi-config"
import { saveKpiValue } from "@/app/data-entry/kpi-actions"

export function KpiEntryRow({
  def,
  week,
  initialValue,
  brand,
}: {
  def: KpiDef
  week: string
  initialValue: number | null
  /** Optional brand scope for per-brand areas (e.g. Marketing & Social). */
  brand?: string
}) {
  const router = useRouter()
  const [value, setValue] = useState<string>(
    initialValue === null ? "" : String(initialValue),
  )
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  const num = value.trim() === "" ? null : Number(value)
  const previewRag = num === null || Number.isNaN(num) ? null : scoreKpi(def, num)

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

  const targetLabel =
    def.direction === "higher_better"
      ? `Green ≥ ${def.green} ${def.unit} · Amber ≥ ${def.amber}`
      : `Green ≤ ${def.green} ${def.unit} · Amber ≤ ${def.amber}`

  return (
    <form
      action={onSave}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="code" value={def.code} />
      <input type="hidden" name="week" value={week} />
      {brand && <input type="hidden" name="brand" value={brand} />}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {previewRag && <RagDot rag={previewRag} />}
          <p className="text-sm font-medium text-foreground">{def.name}</p>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
          {def.help}
        </p>
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">
          {targetLabel}
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
          aria-label={`${def.name} value`}
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
