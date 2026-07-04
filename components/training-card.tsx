"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GraduationCap, PlusCircle, CheckCircle2 } from "lucide-react"
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
import { saveTrainingWeek, confirmTrainingWeek } from "@/app/actions/governance"
import { fmtWeekLong, type Rag } from "@/lib/format"

type TrainingKpis = {
  siteId: number
  learnerCapacity: number
  apprenticeCapacity: number
  privateLearners: number
  apprentices: number
  trainingRag: Rag
  trainingReported: boolean
}

function Metric({
  label,
  value,
  capacity,
  ok,
}: {
  label: string
  value: number
  capacity: number
  ok: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
        <span className="text-sm font-normal text-muted-foreground">
          {" "}
          / {capacity}
        </span>
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={"h-full rounded-full " + (ok ? "bg-rag-green" : "bg-rag-red")}
          style={{
            width: `${capacity > 0 ? Math.min(100, (value / capacity) * 100) : 0}%`,
          }}
        />
      </div>
    </div>
  )
}

export function TrainingCard({
  week,
  kpis,
  entered,
  confirmed,
  confirmedBy,
}: {
  week: string
  kpis: TrainingKpis
  entered: boolean
  confirmed: boolean
  confirmedBy: string | null
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()

  async function confirmAction() {
    setConfirming(true)
    try {
      const fd = new FormData()
      fd.set("siteId", String(kpis.siteId))
      fd.set("weekEnding", week)
      await confirmTrainingWeek(fd)
      router.refresh()
    } finally {
      setConfirming(false)
    }
  }

  const learnersOk =
    kpis.learnerCapacity <= 0 || kpis.privateLearners >= kpis.learnerCapacity
  const apprenticesOk =
    kpis.apprenticeCapacity <= 0 || kpis.apprentices >= kpis.apprenticeCapacity

  async function action(formData: FormData) {
    setPending(true)
    try {
      await saveTrainingWeek(formData)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Training Throughput
            </h2>
            <p className="text-xs text-muted-foreground">
              Weekly capacity: {kpis.learnerCapacity} private learners ·{" "}
              {kpis.apprenticeCapacity} apprentices
            </p>
          </div>
        </div>
        <RagBadge rag={kpis.trainingRag} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Metric
          label="Private learners"
          value={kpis.privateLearners}
          capacity={kpis.learnerCapacity}
          ok={learnersOk}
        />
        <Metric
          label="Apprentices"
          value={kpis.apprentices}
          capacity={kpis.apprenticeCapacity}
          ok={apprenticesOk}
        />
      </div>

      {kpis.trainingReported && kpis.trainingRag === "red" && (
        <p className="mt-3 rounded-md border border-rag-red/30 bg-rag-red/5 px-3 py-2 text-xs text-rag-red">
          Below weekly capacity — a training action has been raised.
        </p>
      )}
      {!kpis.trainingReported && (
        <p className="mt-3 rounded-md border border-rag-red/30 bg-rag-red/5 px-3 py-2 text-xs text-rag-red">
          Not yet reported for W/E {fmtWeekLong(week)}.
        </p>
      )}

      {confirmed ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-md border border-rag-green/30 bg-rag-green/5 px-3 py-2 text-xs text-rag-green">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Confirmed for W/E {fmtWeekLong(week)}
          {confirmedBy ? ` by ${confirmedBy}` : ""}.
        </p>
      ) : entered ? (
        <p className="mt-3 rounded-md border border-rag-amber/40 bg-rag-amber/10 px-3 py-2 text-xs text-rag-amber-foreground">
          Figures entered but <strong>not yet confirmed</strong>. Confirm to
          close out this week.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={<Button size="sm" variant="outline" className="h-8 gap-1.5" />}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            {kpis.trainingReported ? "Update this week" : "Record training"}
          </DialogTrigger>
          <DialogContent>
            <form action={action}>
              <input type="hidden" name="siteId" value={kpis.siteId} />
              <input type="hidden" name="weekEnding" value={week} />
              <DialogHeader>
                <DialogTitle>Training throughput</DialogTitle>
                <DialogDescription>
                  Week ending {fmtWeekLong(week)}. Below either weekly capacity
                  is flagged red.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="privateLearners">Private learners</Label>
                    <Input
                      id="privateLearners"
                      name="privateLearners"
                      type="number"
                      min={0}
                      step="1"
                      defaultValue={
                        kpis.trainingReported ? kpis.privateLearners : ""
                      }
                      placeholder="0"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="apprentices">Apprentices</Label>
                    <Input
                      id="apprentices"
                      name="apprentices"
                      type="number"
                      min={0}
                      step="1"
                      defaultValue={kpis.trainingReported ? kpis.apprentices : ""}
                      placeholder="0"
                      required
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
        {!confirmed && (
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={!entered || confirming}
            onClick={confirmAction}
            title={
              entered
                ? "Confirm this week's training throughput"
                : "Enter this week's figures first"
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {confirming ? "Confirming…" : "Confirm this week"}
          </Button>
        )}
      </div>
    </Card>
  )
}
