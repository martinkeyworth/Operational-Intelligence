"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
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
import { RagBadge } from "@/components/rag"
import { saveSubletting } from "@/app/actions/governance"
import { fmtGBP, fmtWeekLong, type Rag } from "@/lib/format"
import { SUBLET_WEEKLY_TARGET } from "@/lib/subletting-config"

type SubletWeek = {
  siteId: number
  week: string
  amount: number
  target: number
  attainmentPct: number
  rag: Rag
  recordedBy: string | null
  notes: string | null
  reported: boolean
}

export function SubletCard({
  sublet,
  history,
}: {
  sublet: SubletWeek
  history: { week: string; label: string; amount: number; target: number; rag: Rag }[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function action(formData: FormData) {
    setPending(true)
    try {
      await saveSubletting(formData)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const shortfall = sublet.target - sublet.amount

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Subletting Income
            </h2>
            <p className="text-xs text-muted-foreground">
              Chair / room rent · target {fmtGBP(SUBLET_WEEKLY_TARGET)}/week ·
              reviewed quarterly
            </p>
          </div>
        </div>
        <RagBadge rag={sublet.rag} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">
            W/E {fmtWeekLong(sublet.week)}
          </p>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {sublet.reported ? fmtGBP(sublet.amount) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Target</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {fmtGBP(sublet.target)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {sublet.amount >= sublet.target ? "Surplus" : "Shortfall"}
          </p>
          <p
            className={
              "text-xl font-semibold tabular-nums " +
              (sublet.amount >= sublet.target
                ? "text-rag-green"
                : "text-rag-red")
            }
          >
            {sublet.reported
              ? `${shortfall > 0 ? "-" : "+"}${fmtGBP(Math.abs(shortfall))}`
              : "—"}
          </p>
        </div>
      </div>

      {sublet.reported && sublet.amount < sublet.target && (
        <p className="mt-3 rounded-md border border-rag-red/30 bg-rag-red/5 px-3 py-2 text-xs text-rag-red">
          Below the {fmtGBP(sublet.target)} weekly target — a quarterly review
          action has been raised.
        </p>
      )}

      {history.length > 1 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent weeks
          </p>
          <div className="flex flex-wrap gap-2">
            {history
              .slice(-8)
              .reverse()
              .map((h) => (
                <div
                  key={h.week}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1"
                >
                  <span
                    className={
                      "h-2 w-2 rounded-full " +
                      (h.rag === "green" ? "bg-rag-green" : "bg-rag-red")
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {h.label}
                  </span>
                  <span className="text-xs font-medium tabular-nums text-foreground">
                    {fmtGBP(h.amount)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={<Button size="sm" variant="outline" className="h-8 gap-1.5" />}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            {sublet.reported ? "Update this week" : "Record subletting"}
          </DialogTrigger>
          <DialogContent>
            <form action={action}>
              <input type="hidden" name="siteId" value={sublet.siteId} />
              <input type="hidden" name="weekEnding" value={sublet.week} />
              <DialogHeader>
                <DialogTitle>Subletting income</DialogTitle>
                <DialogDescription>
                  Week ending {fmtWeekLong(sublet.week)}. Anything below the
                  weekly target is flagged red and reviewed quarterly.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount received (£)</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={sublet.reported ? sublet.amount : ""}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="target">Weekly target (£)</Label>
                    <Input
                      id="target"
                      name="target"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={sublet.target}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    placeholder="Context for this week…"
                    defaultValue={sublet.notes ?? ""}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  )
}
