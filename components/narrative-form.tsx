"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function NarrativeForm({
  weekEnding,
  field,
  label,
  placeholder,
  initialValue,
  action,
}: {
  weekEnding: string
  field: "narrative" | "response"
  label: string
  placeholder: string
  initialValue: string | null
  action: (formData: FormData) => Promise<void>
}) {
  const [value, setValue] = useState(initialValue ?? "")
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <form
        action={(fd) => {
          fd.set("weekEnding", weekEnding)
          fd.set(field, value)
          startTransition(async () => {
            await action(fd)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
          })
        }}
        className="mt-3 flex flex-col gap-3"
      >
        <textarea
          name={field}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          placeholder={placeholder}
          rows={6}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "Saving…" : "Save"}
          </Button>
          {saved && (
            <span className="text-xs font-medium text-green-600">Saved</span>
          )}
        </div>
      </form>
    </Card>
  )
}
