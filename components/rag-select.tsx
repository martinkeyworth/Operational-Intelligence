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

const RAGS: { value: Rag; label: string; dot: string }[] = [
  { value: "red", label: "Red", dot: "bg-rag-red" },
  { value: "amber", label: "Amber", dot: "bg-rag-amber" },
  { value: "green", label: "Green", dot: "bg-rag-green" },
]

const TRIGGER_STYLE: Record<Rag, string> = {
  red: "border-rag-red/40 bg-rag-red/10 text-rag-red",
  amber: "border-rag-amber/40 bg-rag-amber/10 text-rag-amber",
  green: "border-rag-green/40 bg-rag-green/10 text-rag-green",
}

/** Editable RAG status. Writes straight back to the shared action register. */
export function RagSelect({ id, rag }: { id: number; rag: Rag }) {
  const [value, setValue] = useState<Rag>(rag)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onChange(next: string | null) {
    if (!next) return
    const r = next as Rag
    setValue(r)
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("rag", r)
    startTransition(async () => {
      await setActionRag(fd)
      router.refresh()
    })
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        className={`h-8 w-[110px] text-xs font-semibold capitalize ${TRIGGER_STYLE[value]}`}
      >
        <SelectValue />
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
