"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
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
import { editActionDetails } from "@/app/actions/governance"
import type { ActionRow } from "@/lib/data"

function fieldClass() {
  return "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
}

/**
 * Edit an action's text and priority inline from the register. Priority feeds
 * the auto-RAG escalation, so changing it can change the computed colour. Owner,
 * due date and RAG are edited directly in the row controls.
 */
export function EditActionDialog({ action }: { action: ActionRow }) {
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Edit action"
          />
        }
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Edit action</DialogTitle>
            <DialogDescription>
              Update the action text and priority. Priority drives the
              auto-calculated RAG.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
