"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { createSite } from "@/app/actions/governance"

export function AddSiteDialog() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function action(formData: FormData) {
    setPending(true)
    try {
      await createSite(formData)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-11 gap-2" />}>
        <Plus className="h-4 w-4" />
        Add Site
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Add a new site</DialogTitle>
            <DialogDescription>
              Register a new LTZ location. Details will need weekly confirmation
              by the functional leader.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Site name</Label>
              <Input id="name" name="name" placeholder="LTZ Coventry" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Location / town</Label>
              <Input id="location" name="location" placeholder="Coventry" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" name="region" placeholder="Midlands" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="managerName">Site manager</Label>
                <Input id="managerName" name="managerName" placeholder="Name" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
