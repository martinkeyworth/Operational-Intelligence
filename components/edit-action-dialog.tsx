"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Flag } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RagSelect } from "@/components/rag-select"
import {
  editActionDetails,
  assignActionOwner,
  setActionStatus,
  setActionDueDate,
  setActionRisk,
} from "@/app/actions/governance"
import type { ActionRow, AssignableOwner } from "@/lib/data"

function fieldClass() {
  return "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
}

const STATUSES = ["Open", "In Progress", "Blocked", "Closed"]
const UNASSIGNED = "__none__"

/** Owner editor that saves immediately on change. */
function OwnerField({
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
      <SelectTrigger className="h-9 w-full text-sm">
        <SelectValue placeholder="Assign owner">
          {(val: string) =>
            val === UNASSIGNED
              ? "Unassigned"
              : (owners.find((o) => o.id === val)?.name ?? "Unassigned")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED} className="text-sm">
          Unassigned
        </SelectItem>
        {owners.map((o) => (
          <SelectItem key={o.id} value={o.id} className="text-sm">
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Status editor that saves immediately on change. */
function StatusField({ id, status }: { id: number; status: string }) {
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
      <SelectTrigger className="h-9 w-full text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-sm">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Due-date editor that saves immediately on change. */
function DueDateField({ id, dueDate }: { id: number; dueDate: string | null }) {
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
      className={fieldClass()}
    />
  )
}

/** Risk toggle that saves immediately on change. */
function RiskField({ id, isRisk }: { id: number; isRisk: boolean }) {
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
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
        value
          ? "border-rag-red/40 bg-rag-red/10 text-rag-red"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <Flag className="h-4 w-4" />
      {value ? "On risk register" : "Flag as risk"}
    </button>
  )
}

/**
 * Full action editor reachable by tapping an action's title in the register.
 * Title, description and priority are saved together on submit (priority drives
 * the auto-RAG). Owner, status, due date, RAG and risk each save immediately so
 * everything is editable in one mobile-friendly vertical view — no horizontal
 * scrolling required.
 */
export function EditActionDialog({
  action,
  owners = [],
  trigger,
}: {
  action: ActionRow
  owners?: AssignableOwner[]
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function submit(formData: FormData) {
    formData.set("id", String(action.id))
    setPending(true)
    try {
      await editActionDetails(formData)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Edit action"
            />
          )
        }
      >
        {trigger ? undefined : <span className="sr-only">Edit action</span>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-pretty">Edit action</DialogTitle>
          <DialogDescription>
            {action.functionArea}
            {action.siteName ? ` · ${action.siteName}` : " · Group"}
          </DialogDescription>
        </DialogHeader>

        {/* Live controls — each saves on change */}
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Owner</Label>
            <OwnerField
              id={action.id}
              ownerUserId={action.ownerUserId}
              owners={owners}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <StatusField id={action.id} status={action.status} />
            </div>
            <div className="grid gap-2">
              <Label>Due date</Label>
              <DueDateField id={action.id} dueDate={action.dueDate} />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-4">
            <div className="grid gap-2">
              <Label>RAG</Label>
              <RagSelect
                id={action.id}
                rag={action.rag}
                overridden={action.ragOverridden}
              />
            </div>
            <div className="grid gap-2">
              <Label>Risk</Label>
              <RiskField id={action.id} isRisk={action.isRisk} />
            </div>
          </div>
        </div>

        {/* Text + priority — saved together on submit */}
        <form action={submit} className="border-t border-border pt-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`title-${action.id}`}>Title</Label>
              <Input
                id={`title-${action.id}`}
                name="title"
                defaultValue={action.title}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`description-${action.id}`}>Description</Label>
              <Textarea
                id={`description-${action.id}`}
                name="description"
                defaultValue={action.description ?? ""}
                placeholder="What needs to happen, and why?"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`priority-${action.id}`}>Priority</Label>
              <select
                id={`priority-${action.id}`}
                name="priority"
                defaultValue={action.priority}
                className={fieldClass()}
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Close
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save text & priority"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
