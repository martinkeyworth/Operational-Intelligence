"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RagDot } from "@/components/rag"
import { scoreKpi, type KpiDef } from "@/lib/kpi-config"
import { saveManyKpiValues } from "@/app/data-entry/kpi-actions"

/**
 * A group of weekly KPI inputs with a SINGLE "Save all" button.
 *
 * Replaces the old per-row form (each row had its own Save, which meant leads
 * routinely typed numbers and left without saving every row). All values are
 * held in one place and persisted together via saveManyKpiValues.
 */
export function KpiEntryGroup({
  defs,
  week,
  initial,
  siteId,
}: {
  defs: KpiDef[]
  week: string
  /** Map of KPI code -> stored value (or null if not entered). */
  initial: Record<string, number | null>
  /** Optional site scope for per-site areas. */
  siteId?: number
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    for (const def of defs) {
      const v = initial[def.code]
      seed[def.code] = v === null || v === undefined ? "" : String(v)
    }
    return seed
  })
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  const filledCount = useMemo(
    () => defs.filter((d) => values[d.code]?.trim() !== "").length,
    [defs, values],
  )

  async function onSaveAll() {
    setPending(true)
    setSaved(false)
    try {
      await saveManyKpiValues({
        week,
        siteId: siteId ?? null,
        values: defs.map((d) => ({ code: d.code, value: values[d.code] ?? "" })),
      })
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {defs.map((def) => {
        const raw = values[def.code] ?? ""
        const num = raw.trim() === "" ? null : Number(raw)
        const previewRag =
          num === null || Number.isNaN(num) ? null : scoreKpi(def, num)
        const targetLabel = def.noAmber
          ? def.direction === "higher_better"
            ? `Green ≥ ${def.green} ${def.unit} · else red`
            : `Green ≤ ${def.green} ${def.unit} · else red`
          : def.direction === "higher_better"
            ? `Green ≥ ${def.green} ${def.unit} · Amber ≥ ${def.amber}`
            : `Green ≤ ${def.green} ${def.unit} · Amber ≤ ${def.amber}`

        return (
          <div
            key={def.code}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
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

            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={raw}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [def.code]: e.target.value }))
              }
              placeholder="—"
              aria-label={`${def.name} value`}
              className="h-11 w-full text-base sm:w-28"
            />
          </div>
        )
      })}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {filledCount} of {defs.length} filled — saved together in one tap.
        </p>
        <Button
          type="button"
          onClick={onSaveAll}
          disabled={pending}
          className="h-11 min-w-[120px]"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <>
              <Check className="mr-1 h-4 w-4" />
              Saved
            </>
          ) : (
            "Save all"
          )}
        </Button>
      </div>
    </div>
  )
}
