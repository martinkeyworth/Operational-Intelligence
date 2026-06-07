"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RagBadge } from "@/components/rag"
import { Plus, Pencil, Check, Clock, ShieldAlert, AlertCircle, ListTodo } from "lucide-react"
import { createLogEntry, editLogEntry, closeLogEntry } from "@/app/functions/log-actions"
import { ENTRY_TYPES, type EntryType } from "@/lib/access-types"
import type { ActionRow, AssignableOwner } from "@/lib/data"

const UNASSIGNED = "__none__"
const TYPE_META: Record<
  EntryType,
  { label: string; blurb: string; icon: typeof ShieldAlert }
> = {
  Risk: { label: "Risks", blurb: "Potential threats to watch", icon: ShieldAlert },
  Issue: { label: "Issues", blurb: "Current problems to resolve", icon: AlertCircle },
  Action: { label: "Actions", blurb: "Tasks to complete", icon: ListTodo },
}
const STATUSES = ["Open", "In Progress", "Blocked", "Closed"]
const PRIORITIES = ["High", "Medium", "Low"]

type Props = {
  areaKey: string
  areaLabel: string
  entries: ActionRow[]
  owners: AssignableOwner[]
  canManage: boolean
}

export function AreaLog({ areaKey, areaLabel, entries, owners, canManage }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {areaLabel} RAID Log
          </h2>
          <p className="text-xs text-muted-foreground">
            Risks, issues and actions for this area — rolls up to the group dashboard.
          </p>
        </div>
        {canManage && (
          <EntryDialog areaKey={areaKey} owners={owners} mode="create" />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ENTRY_TYPES.map((type) => {
          const list = entries.filter((e) => (e.entryType ?? "Action") === type)
          const meta = TYPE_META[type]
          const Icon = meta.icon
          const openCount = list.filter((e) => e.status !== "Closed").length
          return (
            <Card key={type} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {meta.label}
                  </h3>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {openCount} open
                </span>
              </div>
              <p className="-mt-1 text-[11px] text-muted-foreground">{meta.blurb}</p>

              <div className="flex flex-col gap-2">
                {list.length === 0 && (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    No {meta.label.toLowerCase()} logged.
                  </p>
                )}
                {list.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    owners={owners}
                    canManage={canManage}
                  />
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function EntryRow({
  entry,
  owners,
  canManage,
}: {
  entry: ActionRow
  owners: AssignableOwner[]
  canManage: boolean
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const closed = entry.status === "Closed"

  function close() {
    const fd = new FormData()
    fd.set("id", String(entry.id))
    startTransition(async () => {
      await closeLogEntry(fd)
      router.refresh()
    })
  }

  return (
    <div
      className={`rounded-md border border-border p-2.5 ${closed ? "opacity-55" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{entry.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {entry.ownerLabel}
            {entry.siteName ? ` · ${entry.siteName}` : ""}
            {` · ${entry.status}`}
          </p>
          {entry.overdue && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-rag-red/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rag-red">
              <Clock className="h-2.5 w-2.5" />
              {entry.daysOverdue}d overdue
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <RagBadge rag={entry.rag} className="px-1.5 py-0.5 text-[10px]" />
          {canManage && !closed && (
            <>
              <EntryDialog
                areaKey={entry.functionArea}
                owners={owners}
                mode="edit"
                entry={entry}
              />
              <button
                type="button"
                onClick={close}
                disabled={pending}
                title="Resolve / close"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EntryDialog({
  areaKey,
  owners,
  mode,
  entry,
}: {
  areaKey: string
  owners: AssignableOwner[]
  mode: "create" | "edit"
  entry?: ActionRow
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const [type, setType] = useState<EntryType>(
    (entry?.entryType as EntryType) ?? "Action",
  )
  const [rag, setRag] = useState(entry?.rag ?? "amber")
  const [priority, setPriority] = useState(entry?.priority ?? "Medium")
  const [status, setStatus] = useState(entry?.status ?? "Open")
  const [ownerUserId, setOwnerUserId] = useState(entry?.ownerUserId ?? UNASSIGNED)

  function submit(formData: FormData) {
    formData.set("functionArea", areaKey)
    formData.set("entryType", type)
    formData.set("rag", rag)
    formData.set("priority", priority)
    formData.set("ownerUserId", ownerUserId === UNASSIGNED ? "" : ownerUserId)
    if (mode === "edit" && entry) {
      formData.set("id", String(entry.id))
      formData.set("status", status)
    }
    startTransition(async () => {
      if (mode === "edit") await editLogEntry(formData)
      else await createLogEntry(formData)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          mode === "create" ? (
            <Button size="sm" className="h-9 gap-1.5" />
          ) : (
            <button
              type="button"
              title="Edit"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
            />
          )
        }
      >
        {mode === "create" ? (
          <>
            <Plus className="h-4 w-4" />
            New entry
          </>
        ) : (
          <Pencil className="h-3.5 w-3.5" />
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New log entry" : "Edit entry"}
          </DialogTitle>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="entryType">Type</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as EntryType)}>
              <SelectTrigger id="entryType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={entry?.title ?? ""}
              placeholder="Short summary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Detail</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={entry?.description ?? ""}
              placeholder="What is happening and why it matters"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rag">RAG</Label>
              <Select value={rag} onValueChange={(v) => v && setRag(v)}>
                <SelectTrigger id="rag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="red">Red</SelectItem>
                  <SelectItem value="amber">Amber</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={entry?.dueDate ?? ""}
              />
            </div>
            {mode === "edit" && (
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ownerUserId">Owner</Label>
            <Select value={ownerUserId} onValueChange={(v) => v && setOwnerUserId(v)}>
              <SelectTrigger id="ownerUserId">
                <SelectValue placeholder="Assign owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Add entry" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
