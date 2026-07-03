"use client"

import { cn } from "@/lib/utils"
import { PBC_BANDS, PBC_SCORES, PBC_DIMENSIONS, type PbcDimension } from "@/lib/learning-types"

/** A 1-5 score picker (1 best, 5 lowest). */
export function ScorePicker({
  value,
  onChange,
  disabled,
  name,
}: {
  value: number | null | undefined
  onChange?: (score: number) => void
  disabled?: boolean
  name?: string
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Score 1 (best) to 5 (lowest)">
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      {PBC_SCORES.map((s) => {
        const active = value === s
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange?.(s)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent text-foreground hover:bg-accent",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {s}
          </button>
        )
      })}
    </div>
  )
}

export function pbcScoreLabel(score: number | null | undefined) {
  if (!score) return "—"
  return PBC_BANDS.find((b) => b.score === score)?.label ?? String(score)
}

/** The static 1-5 band criteria guide. */
export function PbcGuide() {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Scoring guide (1 best – 5 lowest)
      </p>
      <ul className="space-y-1.5">
        {PBC_BANDS.map((b) => (
          <li key={b.score} className="text-xs leading-relaxed text-foreground">
            <span className="font-semibold tabular-nums">{b.score}</span>{" "}
            <span className="font-medium">{b.label}</span>
            <span className="text-muted-foreground"> — {b.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Read-only three-dimension PBC summary. */
export function PbcSummary({
  scores,
}: {
  scores: { performance?: number | null; behaviours?: number | null; contribution?: number | null; overall?: number | null }
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {PBC_DIMENSIONS.map((d) => (
        <PbcStat key={d.key} label={d.label} score={scores[d.key as PbcDimension]} />
      ))}
      <PbcStat label="Overall" score={scores.overall} highlight />
    </div>
  )
}

function PbcStat({ label, score, highlight }: { label: string; score?: number | null; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card")}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{score ?? "—"}</p>
      <p className="text-xs text-muted-foreground">{pbcScoreLabel(score)}</p>
    </div>
  )
}
