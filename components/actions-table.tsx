"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { RagSelect } from "@/components/rag-select"
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
import { setActionStatus, assignActionOwner, setActionRisk, setActionDueDate, editActionDetails } from "@/app/actions/governance"
import type { ActionRow, AssignableOwner } from "@/lib/data"
import { AlertTriangle, Flag, Clock } from "lucide-react"
import { EditActionDialog } from "@/components/edit-action-dialog"

const STATUSES = ["Open", "In Progress", "Blocked", "Closed"]

const PRIORITIES = ["High", "Medium", "Low"]

const UNASSIGNED = "__none__"

const PRIORITY_TRIGGER: Record<string, string> = {
  High: "border-rag-red/40 bg-rag-red/10 text-rag-red",
  Medium: "border-rag-amber/40 bg-rag-amber/10 text-rag-amber",
  Low: "border-border text-muted-foreground",
}

/** Inline priority editor. Priority drives the auto-RAG escalation thresholds. */
function PrioritySelect({ id, priority }: { id: number; priority: string }) {
  const [value, setValue] = useState(priority)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onChange(next: string | null) {
    if (!next) return
    setValue(next)
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("priority", next)
    startTransition(async () => {
      await editActionDetails(fd)
      router.refresh()
    })
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        className={`h-8 w-[110px] text-xs font-semibold ${PRIORITY_TRIGGER[value] ?? "border-border"}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((p) => (
          <SelectItem key={p} value={p} className="text-xs">
            {p}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
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
        <SelectValue placeholder="Assign owner">
          {(val: string) =>
            val === UNASSIGNED
              ? "Unassigned"
              : (owners.find((o) => o.id === val)?.name ?? "Unassigned")
          }
        </SelectValue>
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

function DueDateInput({
  id,
  dueDate,
  overdue,
}: {
  id: number
  dueDate: string | null
  overdue: boolean
}) {
  const [value, setValue] = useState(dueDate ?? "")
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onChange(next: string) {
    setValue(next)
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("dueDate", next)
    startTransition(async () => {
      await setActionDueDate(fd)
      router.refresh()
    })
  }

  return (
    <input
      type="date"
      value={value}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Due date"
      className={`h-8 w-[150px] rounded-md border bg-transparent px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        overdue ? "border-rag-red/50 text-rag-red" : "border-border"
      }`}
    />
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
  focusId,
}: {
  actions: ActionRow[]
  owners: AssignableOwner[]
  focusId?: number | null
}) {
  const focusRef = useRef<HTMLTableRowElement>(null)

  // When deep-linked from another surface (e.g. the dashboard Key Risks panel),
  // scroll the targeted action into view so it's obvious which row to edit.
  useEffect(() => {
    if (focusId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [focusId])

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
              <TableHead>Due</TableHead>
              <TableHead>RAG</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.map((a) => {
              const focused = focusId === a.id
              return (
              <TableRow
                key={a.id}
                ref={focused ? focusRef : undefined}
                className={cn(
                  a.status === "Closed" && "opacity-55",
                  focused && "bg-primary/5 ring-1 ring-inset ring-primary/40",
                )}
              >
                <TableCell>
                  <div className="flex items-start gap-2">
                    {a.escalated && a.status !== "Closed" && (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rag-red" />
                    )}
                    <div>
                      <EditActionDialog
                        action={a}
                        owners={owners}
                        trigger={
                          <button
                            type="button"
                            className="text-left text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                          />
                        }
                      >
                        {a.title}
                      </EditActionDialog>
                      {a.description && (
                        <p className="text-xs text-muted-foreground">
                          {a.description}
                        </p>
                      )}
                      {a.overdue && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                          <Clock className="h-3 w-3" />
                          {a.daysOverdue} day{a.daysOverdue === 1 ? "" : "s"} overdue
                        </span>
                      )}
                      {a.escalated && a.status !== "Closed" && (
                        <span className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-rag-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
                          <AlertTriangle className="h-3 w-3" />
                          {a.autoEscalated ? "Auto-escalated" : "Escalated"}
                          {a.escalationReason ? `: ${a.escalationReason}` : ""}
                        </span>
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
                  <PrioritySelect id={a.id} priority={a.priority} />
                </TableCell>
                <TableCell>
                  <DueDateInput id={a.id} dueDate={a.dueDate} overdue={a.overdue} />
                </TableCell>
                <TableCell>
                  <RagSelect id={a.id} rag={a.rag} overridden={a.ragOverridden} />
                </TableCell>
                <TableCell>
                  <StatusSelect id={a.id} status={a.status} />
                </TableCell>
                <TableCell>
                  <EditActionDialog action={a} />
                </TableCell>
              </TableRow>
              )
            })}
            {actions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={10}
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
