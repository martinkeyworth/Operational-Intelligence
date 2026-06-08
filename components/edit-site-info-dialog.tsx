"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Settings2 } from "lucide-react"
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
import { editSite } from "@/app/actions/governance"

type Props = {
  siteId: number
  name: string
  location: string
  brand: string
  region: string | null
  managerName: string | null
  siteType: string
  headcount: number
  chairs: number
  chairCapacity: number
}

export function EditSiteInfoDialog({
  siteId,
  name,
  location,
  brand,
  region,
  managerName,
  siteType,
  headcount,
  chairs,
  chairCapacity,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function action(formData: FormData) {
    setPending(true)
    try {
      await editSite(formData)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-9 gap-2" />}>
        <Settings2 className="h-4 w-4" />
        Site info
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <input type="hidden" name="id" value={siteId} />
          <input type="hidden" name="brand" value={brand} />
          <input type="hidden" name="siteType" value={siteType} />
          <DialogHeader>
            <DialogTitle>Edit site info</DialogTitle>
            <DialogDescription>
              Update {name}&apos;s details. Capacity, chairs and the number of
              barbers drive the weekly submission tally.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Site name</Label>
              <Input id="name" name="name" defaultValue={name} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="location">Location / town</Label>
                <Input
                  id="location"
                  name="location"
                  defaultValue={location}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" name="region" defaultValue={region ?? ""} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="managerName">Site manager</Label>
              <Input
                id="managerName"
                name="managerName"
                defaultValue={managerName ?? ""}
                placeholder="Name"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="chairCapacity">Capacity</Label>
                <Input
                  id="chairCapacity"
                  name="chairCapacity"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={chairCapacity}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="chairs">Chairs</Label>
                <Input
                  id="chairs"
                  name="chairs"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={chairs}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="headcount">Barbers</Label>
                <Input
                  id="headcount"
                  name="headcount"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={headcount}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Capacity = the most barbers the site could ever support. Chairs =
              physical chairs installed. Barbers = how many are working now —
              this is the target the weekly takings tally is measured against.
            </p>
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
