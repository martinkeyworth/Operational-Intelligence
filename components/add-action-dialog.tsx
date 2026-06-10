"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { createAction } from "@/app/actions/governance"
import type { AssignableOwner } from "@/lib/data"
import type { SiteOption } from "@/lib/registers-types"

const AREAS = [
  "Capacity",
  "RTB",
  "Subletting",
  "Training",
  "HR",
  "Marketing",
  "Finance",
  "Governance",
  "Estate",
]

const UNASSIGNED = "__none__"

function fieldClass() {
  return "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
}

/**
 * Raise a new action, risk or issue on the register. Captures everything the
 * register needs up front: title, RAID type, area, scope, owner, priority, RAG
 * and due date. Complements the KPI-driven auto-raised actions.
 */
export function AddActionDialog({
  owners,
  sites,
}: {
  owners: AssignableOwner[]
  sites: SiteOption[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [ownerId, setOwnerId] = useState(UNASSIGNED)
  const router = useRouter()

  async function action(formData: FormData) {
    formData.set("ownerUserId", ownerId === UNASSIGNED ? "" : ownerId)
    setPending(true)
    try {
      await createAction(formData)
      setOpen(false)
      setOwnerId(UNASSIGNED)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-9 gap-2" />}>
        <Plus className="h-4 w-4" />
        New action
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Raise an action</DialogTitle>
            <DialogDescription>
              Add an action, risk or issue to the register. Assign an owner and a
              due date so it feeds the weekly operational meeting.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. Recruit a second barber for Woodseats"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="What needs to happen, and why?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="entryType">Type</Label>
                <select
                  id="entryType"
                  name="entryType"
                  defaultValue="Action"
                  className={fieldClass()}
                >
                  <option value="Action">Action</option>
                  <option value="Risk">Risk</option>
                  <option value="Issue">Issue</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="functionArea">Area</Label>
                <select
                  id="functionArea"
                  name="functionArea"
                  defaultValue="Governance"
                  className={fieldClass()}
                >
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="siteId">Scope</Label>
                <select
                  id="siteId"
                  name="siteId"
                  defaultValue=""
                  className={fieldClass()}
                >
                  <option value="">Group-wide</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="owner">Owner</Label>
                <select
                  id="owner"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className={fieldClass()}
                >
                  <option value={UNASSIGNED}>Unassigned</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue="Medium"
                  className={fieldClass()}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rag">RAG</Label>
                <select
                  id="rag"
                  name="rag"
                  defaultValue="amber"
                  className={fieldClass()}
                >
                  <option value="red">Red</option>
                  <option value="amber">Amber</option>
                  <option value="green">Green</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Due date</Label>
                <Input id="dueDate" name="dueDate" type="date" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Raise action"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
