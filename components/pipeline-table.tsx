"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PlannedOpeningPlan } from "@/lib/hr"
import { saveOpeningRoles, resetOpeningRoles } from "@/app/reports/workforce/actions"

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
const fmtMonth = (year: number, month: number) =>
  `${MONTH_LABELS[month - 1]} ${year}`

type Draft = { manager: number; barber: number; apprentice: number }

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="min-w-[88px]">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="h-11 w-16 text-base tabular-nums"
        aria-label={label}
      />
    </label>
  )
}

function OpeningRow({ op }: { op: PlannedOpeningPlan }) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({
    manager: op.managerCount,
    barber: op.barberCount,
    apprentice: op.apprenticeCount,
  })

  const cuttingLabel = op.cuttingRole

  function startEdit() {
    setDraft({
      manager: op.managerCount,
      barber: op.barberCount,
      apprentice: op.apprenticeCount,
    })
    setError(null)
    setEditing(true)
  }

  function save() {
    setError(null)
    const clean = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n)
    startTransition(async () => {
      const res = await saveOpeningRoles({
        location: op.location,
        year: op.year,
        month: op.month,
        managerCount: clean(draft.manager),
        barberCount: clean(draft.barber),
        apprenticeCount: clean(draft.apprentice),
      })
      if (res.ok) setEditing(false)
      else setError(res.error)
    })
  }

  function reset() {
    setError(null)
    startTransition(async () => {
      const res = await resetOpeningRoles({
        location: op.location,
        year: op.year,
        month: op.month,
      })
      if (res.ok) setEditing(false)
      else setError(res.error)
    })
  }

  const draftTotal =
    [draft.manager, draft.barber, draft.apprentice]
      .map((n) => (Number.isNaN(n) ? 0 : n))
      .reduce((a, b) => a + b, 0)

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="px-4 py-3 text-foreground">
        {op.location}
        <span className="text-muted-foreground"> · {op.tier}</span>
        {op.isCustomised && !editing && (
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Edited
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
        {fmtMonth(op.year, op.month)}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex flex-col gap-2">
            <NumberField
              label="Manager"
              value={draft.manager}
              onChange={(n) => setDraft((d) => ({ ...d, manager: n }))}
            />
            <NumberField
              label={cuttingLabel}
              value={draft.barber}
              onChange={(n) => setDraft((d) => ({ ...d, barber: n }))}
            />
            <NumberField
              label="Apprentice"
              value={draft.apprentice}
              onChange={(n) => setDraft((d) => ({ ...d, apprentice: n }))}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {op.roles
              .filter((r) => r.count > 0)
              .map((r) => (
                <span
                  key={r.role}
                  className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {r.count} {r.role}
                </span>
              ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
        {editing ? draftTotal : op.totalRoles}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {editing ? (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button size="sm" className="h-9" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
            {op.isCustomised && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={reset}
                disabled={pending}
              >
                Reset to default
              </Button>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={startEdit}
          >
            Edit
          </Button>
        )}
      </td>
    </tr>
  )
}

export function PipelineTable({ pipeline }: { pipeline: PlannedOpeningPlan[] }) {
  if (pipeline.length === 0) return null
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">
          Planned opening pipeline
        </h2>
        <p className="text-xs text-muted-foreground text-pretty">
          Roles to recruit ahead of each scheduled opening. Headcount depends on
          the size of the unit rented — tap Edit to adjust any opening.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Opening</th>
              <th className="px-4 py-2 text-left font-medium">When</th>
              <th className="px-4 py-2 text-left font-medium">Roles</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 text-right font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pipeline.map((op) => (
              <OpeningRow key={`${op.location}-${op.year}-${op.month}`} op={op} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
