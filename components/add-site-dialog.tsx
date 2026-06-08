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
import { SITE_BRANDS } from "@/components/confirm-site-dialog"

export function AddSiteDialog() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [siteType, setSiteType] = useState<"barbershop" | "training">(
    "barbershop",
  )
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
            <div className="grid gap-2">
              <Label htmlFor="brand">Site brand</Label>
              <select
                id="brand"
                name="brand"
                defaultValue={SITE_BRANDS[0]}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SITE_BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="region">Region</Label>
              <Input id="region" name="region" placeholder="Midlands" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="managerName">Site manager</Label>
                <Input id="managerName" name="managerName" placeholder="Name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="headcount">Number of barbers</Label>
                <Input
                  id="headcount"
                  name="headcount"
                  type="number"
                  min={0}
                  step="1"
                  placeholder="e.g. 6"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="siteType">Site type</Label>
              <select
                id="siteType"
                name="siteType"
                value={siteType}
                onChange={(e) =>
                  setSiteType(e.target.value as "barbershop" | "training")
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="barbershop">Barbershop</option>
                <option value="training">Training academy</option>
              </select>
            </div>
            {siteType === "barbershop" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="chairCapacity">Capacity</Label>
                  <Input
                    id="chairCapacity"
                    name="chairCapacity"
                    type="number"
                    min={0}
                    step="1"
                    placeholder="e.g. 10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Max barbers the site could ever support.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="chairs">Number of chairs</Label>
                  <Input
                    id="chairs"
                    name="chairs"
                    type="number"
                    min={0}
                    step="1"
                    placeholder="e.g. 8"
                  />
                  <p className="text-xs text-muted-foreground">
                    Physical chairs installed.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="learnerCapacity">Private learners / wk</Label>
                  <Input
                    id="learnerCapacity"
                    name="learnerCapacity"
                    type="number"
                    min={0}
                    step="1"
                    placeholder="e.g. 50"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="apprenticeCapacity">Apprentices / wk</Label>
                  <Input
                    id="apprenticeCapacity"
                    name="apprenticeCapacity"
                    type="number"
                    min={0}
                    step="1"
                    placeholder="e.g. 10"
                  />
                </div>
              </div>
            )}
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
