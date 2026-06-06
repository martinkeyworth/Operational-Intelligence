"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { RagSelect } from "@/components/rag-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  setActionStatus,
  assignActionOwner,
  setActionRisk,
} from "@/app/actions/governance"
import type { ActionRow, AssignableOwner } from "@/lib/data"
import { AlertTriangle, Flag } from "lucide-react"

const STATUSES = ["Open", "In Progress", "Blocked", "Closed"]
const UNASSIGNED = "__none__"

/** Editable operational-meeting card. All edits write back to the action register. */
export function OperationsActionCard({
  action,
  owners,
}: {
  action: ActionRow
  owners: AssignableOwner[]
}) {
  const [status, setStatus] = useState(action.status)
  const [ownerId, setOwnerId] = useState(action.ownerUserId ?? UNASSIGNED)
  const [isRisk, setIsRisk] = useState(action.isRisk)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn()
      router.refresh()
    })
  }

  function changeStatus(next: string | null) {
    if (!next) return
    setStatus(next)
    const fd = new FormData()
    fd.set("id", String(action.id))
    fd.set("status", next)
    run(() => setActionStatus(fd))
  }

  function changeOwner(next: string | null) {
    if (!next) return
    setOwnerId(next)
    const fd = new FormData()
    fd.set("id", String(action.id))
    fd.set("ownerUserId", next === UNASSIGNED ? "" : next)
    run(() => assignActionOwner(fd))
  }

  function toggleRisk() {
    const next = !isRisk
    setIsRisk(next)
    const fd = new FormData()
    fd.set("id", String(action.id))
    fd.set("isRisk", String(next))
    run(() => setActionRisk(fd))
  }

  return (
    <Card
      className={`p-4 ${status === "Closed" ? "opacity-55" : ""} ${pending ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-3">
        {action.escalated && status !== "Closed" && (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rag-red" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{action.title}</p>
            {isRisk && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rag-red/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                <Flag className="h-3 w-3" />
                Risk
              </span>
            )}
          </div>
          {action.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {action.description}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {action.functionArea} · {action.siteName ?? "Group"} ·{" "}
            {action.priority} priority
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RagSelect id={action.id} rag={action.rag} />

            <Select value={status} onValueChange={changeStatus} disabled={pending}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ownerId} onValueChange={changeOwner} disabled={pending}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Assign owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED} className="text-xs">
                  Unassigned
                </SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              type="button"
              onClick={toggleRisk}
              disabled={pending}
              aria-pressed={isRisk}
              title={isRisk ? "Remove from risk register" : "Flag as risk"}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors ${
                isRisk
                  ? "border-rag-red/40 bg-rag-red/10 text-rag-red"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Flag className="h-3.5 w-3.5" />
              {isRisk ? "Risk" : "Flag risk"}
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}
