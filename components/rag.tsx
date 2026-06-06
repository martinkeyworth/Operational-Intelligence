import { cn } from "@/lib/utils"
import type { Rag } from "@/lib/data"

const LABELS: Record<Rag, string> = {
  green: "On track",
  amber: "At risk",
  red: "Critical",
}

const DOT: Record<Rag, string> = {
  green: "bg-rag-green",
  amber: "bg-rag-amber",
  red: "bg-rag-red",
}

const PILL: Record<Rag, string> = {
  green: "bg-rag-green/15 text-rag-green border-rag-green/30",
  amber: "bg-rag-amber/15 text-rag-amber border-rag-amber/30",
  red: "bg-rag-red/15 text-rag-red border-rag-red/30",
}

export function RagDot({ rag, className }: { rag: Rag; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 rounded-full", DOT[rag], className)}
      aria-label={LABELS[rag]}
    />
  )
}

export function RagBadge({
  rag,
  label,
  className,
}: {
  rag: Rag
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        PILL[rag],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[rag])} />
      {label ?? LABELS[rag]}
    </span>
  )
}

export function ragText(rag: Rag): string {
  return LABELS[rag]
}
