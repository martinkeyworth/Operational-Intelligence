"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setActionRag } from "@/app/actions/governance"
import type { Rag } from "@/lib/data"

type RagValue = Rag | "auto"

const RAGS: { value: RagValue; label: string; dot: string }[] = [
  { value: "auto", label: "Auto", dot: "bg-muted-foreground" },
  { value: "red", label: "Red", dot: "bg-rag-red" },
  { value: "amber", label: "Amber", dot: "bg-rag-amber" },
  { value: "green", label: "Green", dot: "bg-rag-green" },
]

const TRIGGER_STYLE: Record<Rag, string> = {
  red: "border-rag-red/40 bg-rag-red/10 text-rag-red",
  amber: "border-rag-amber/40 bg-rag-amber/10 text-rag-amber",
  green: "border-rag-green/40 bg-rag-green/10 text-rag-green",
}

/**
 * Editable RAG status. By default RAG is auto-calculated from age, priority,
 * KPI flags and the 5x5 (Strategy) rule; selecting a colour pins it manually,
 * and selecting "Auto" reverts to the calculated value. `overridden` marks a
 * currently-pinned value (shown with a dot) vs an auto value.
 */
export function RagSelect({
  id,
  rag,
  overridden = false,
}: {
  id: number
  rag: Rag
  overridden?: boolean
}) {
  // The select reflects the effective colour, plus whether it's pinned.
  const [value, setValue] = useState<Rag>(rag)
  const [pinned, setPinned] = useState(overridden)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onChange(next: string | null) {
    if (!next) return
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("rag", next)
    if (next === "auto") {
      setPinned(false)
    } else {
      setValue(next as Rag)
      setPinned(true)
    }
    startTransition(async () => {
      await setActionRag(fd)
      router.refresh()
    })
  }

  return (
    <Select value={pinned ? value : "auto"} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        className={`h-8 w-[120px] text-xs font-semibold capitalize ${TRIGGER_STYLE[value]}`}
        title={pinned ? "Manually pinned RAG" : "Auto-calculated RAG"}
      >
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${pinned ? "bg-current" : "opacity-0"}`} />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {RAGS.map((r) => (
          <SelectItem key={r.value} value={r.value} className="text-xs">
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${r.dot}`} />
              {r.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
