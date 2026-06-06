"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { RagBadge } from "@/components/rag"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setActionStatus, assignActionOwner, setActionRisk } from "@/app/actions/governance"
import type { ActionRow, AssignableOwner } from "@/lib/data"
import { AlertTriangle, Flag } from "lucide-react"

const STATUSES = ["Open", "In Progress", "Blocked", "Closed"]

const UNASSIGNED = "__none__"

const PRIORITY_STYLE: Record<string, string> = {
  High: "text-rag-red",
  Medium: "text-rag-amber",
  Low: "text-muted-foreground",
}

function StatusSelect({ id, status }: { id: number; status: string }) {
  const [value, setValue] = useState(status)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onChange(next: string | null) {
    if (!next) return
    setValue(next)
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("status", next)
    startTransition(async () => {
      await setActionStatus(fd)
      router.refresh()
    })
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
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
  )
}

function OwnerSelect({
  id,
  ownerUserId,
  owners,
}: {
  id: number
  ownerUserId: string | null
  owners: AssignableOwner[]
}) {
  const [value, setValue] = useState(ownerUserId ?? UNASSIGNED)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onChange(next: string | null) {
    if (!next) return
    setValue(next)
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("ownerUserId", next === UNASSIGNED ? "" : next)
    startTransition(async () => {
      await assignActionOwner(fd)
      router.refresh()
    })
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-[150px] text-xs">
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
  )
}

function RiskToggle({ id, isRisk }: { id: number; isRisk: boolean }) {
  const [value, setValue] = useState(isRisk)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function toggle() {
    const next = !value
    setValue(next)
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("isRisk", String(next))
    startTransition(async () => {
      await setActionRisk(fd)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={value}
      title={value ? "On the risk register" : "Flag as risk"}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors ${
        value
          ? "border-rag-red/40 bg-rag-red/10 text-rag-red"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <Flag className="h-3.5 w-3.5" />
      {value ? "Risk" : "Flag"}
    </button>
  )
}

export function ActionsTable({
  actions,
  owners,
}: {
  actions: ActionRow[]
  owners: AssignableOwner[]
}) {
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[260px]">Action</TableHead>
              <TableHead>Function</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>RAG</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.map((a) => (
              <TableRow
                key={a.id}
                className={a.status === "Closed" ? "opacity-55" : undefined}
              >
                <TableCell>
                  <div className="flex items-start gap-2">
                    {a.escalated && a.status !== "Closed" && (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rag-red" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {a.title}
                      </p>
                      {a.description && (
                        <p className="text-xs text-muted-foreground">
                          {a.description}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.functionArea}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.siteName ?? "Group"}
                </TableCell>
                <TableCell>
                  <OwnerSelect
                    id={a.id}
                    ownerUserId={a.ownerUserId}
                    owners={owners}
                  />
                </TableCell>
                <TableCell>
                  <RiskToggle id={a.id} isRisk={a.isRisk} />
                </TableCell>
                <TableCell>
                  <span
                    className={`text-xs font-semibold ${PRIORITY_STYLE[a.priority] ?? "text-muted-foreground"}`}
                  >
                    {a.priority}
                  </span>
                </TableCell>
                <TableCell>
                  <RagBadge rag={a.rag} />
                </TableCell>
                <TableCell>
                  <StatusSelect id={a.id} status={a.status} />
                </TableCell>
              </TableRow>
            ))}
            {actions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No actions on the register.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
