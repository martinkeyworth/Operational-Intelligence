"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ShieldCheck } from "lucide-react"
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
import { confirmSiteWeek } from "@/app/actions/governance"
import { fmtWeekLong } from "@/lib/format"

export function ConfirmSiteDialog({
  siteId,
  siteName,
  managerName,
  headcount,
  week,
  confirmed,
  confirmedBy,
}: {
  siteId: number
  siteName: string
  managerName: string | null
  headcount: number
  week: string
  confirmed: boolean
  confirmedBy: string | null
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function action(formData: FormData) {
    setPending(true)
    try {
      await confirmSiteWeek(formData)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {confirmed ? (
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-rag-green/30 text-rag-green hover:text-rag-green"
            />
          }
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirmed
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" className="h-8 gap-1.5" />}>
          <ShieldCheck className="h-3.5 w-3.5" />
          Confirm week
        </DialogTrigger>
      )}
      <DialogContent>
        <form action={action}>
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="weekEnding" value={week} />
          <DialogHeader>
            <DialogTitle>Confirm site details</DialogTitle>
            <DialogDescription>
              Functional leader sign-off for {siteName} — week ending{" "}
              {fmtWeekLong(week)}. Verify the details below are correct for this
              week.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="siteNameConfirmed">Confirmed site name</Label>
              <Input
                id="siteNameConfirmed"
                name="siteNameConfirmed"
                defaultValue={siteName}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="managerConfirmed">Site manager</Label>
                <Input
                  id="managerConfirmed"
                  name="managerConfirmed"
                  defaultValue={managerName ?? ""}
                  placeholder="Name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="headcountConfirmed">Headcount</Label>
                <Input
                  id="headcountConfirmed"
                  name="headcountConfirmed"
                  type="number"
                  min={0}
                  defaultValue={headcount}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={2}
                placeholder="Any changes or context for this week…"
              />
            </div>
            {confirmed && confirmedBy && (
              <p className="text-xs text-muted-foreground">
                Previously confirmed by {confirmedBy}. Re-submitting will update
                the record.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Confirm details"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
