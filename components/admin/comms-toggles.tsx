"use client"

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { COMM_CHANNELS, type CommKey } from "@/lib/comms-config"
import { toggleComm } from "@/app/admin/comms/actions"

type Props = {
  initial: Record<CommKey, boolean>
  canEdit: boolean
}

const GROUP_ORDER = [
  "Channels",
  "Weekly report",
  "RAID",
  "Team (1-2-1 & 360)",
] as const

export function CommsToggles({ initial, canEdit }: Props) {
  const [state, setState] = useState<Record<CommKey, boolean>>(initial)
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<CommKey | null>(null)

  function onToggle(key: CommKey, next: boolean) {
    if (!canEdit) return
    setBusyKey(key)
    setState((s) => ({ ...s, [key]: next })) // optimistic
    startTransition(async () => {
      const res = await toggleComm(key, next)
      if (!res.ok) setState((s) => ({ ...s, [key]: !next })) // revert on failure
      setBusyKey(null)
    })
  }

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: COMM_CHANNELS.filter((c) => c.group === group),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="flex flex-col gap-8">
      {grouped.map(({ group, items }) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{group}</h2>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {items.map((c) => {
              const on = state[c.key]
              return (
                <div
                  key={c.key}
                  className="flex items-start justify-between gap-4 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {c.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          on
                            ? "bg-rag-green/15 text-rag-green"
                            : "bg-rag-red/15 text-rag-red",
                        )}
                      >
                        {on ? "On" : "Paused"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {c.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? "Pause" : "Enable"} ${c.label}`}
                    disabled={!canEdit || (pending && busyKey === c.key)}
                    onClick={() => onToggle(c.key, !on)}
                    className={cn(
                      "relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      on ? "bg-rag-green" : "bg-muted",
                      !canEdit && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
                        on ? "translate-x-5" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
