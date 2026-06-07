"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Gavel } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createDecision,
  setDecisionStatus,
} from "@/app/actions/registers"
import type { DecisionRow } from "@/lib/registers"
import type { SiteOption } from "@/lib/registers"
import { fmtDate } from "@/lib/format"

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

const STATUS_STYLE: Record<string, string> = {
  Active: "border-emerald-500/40 text-emerald-400",
  Superseded: "border-amber-500/40 text-amber-400",
  Reversed: "border-red-500/40 text-red-400",
}

function fieldClass() {
  return "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
}

function AddDecisionDialog({ sites }: { sites: SiteOption[] }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function action(formData: FormData) {
    setPending(true)
    try {
      await createDecision(formData)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-9 gap-2" />}>
        <Plus className="h-4 w-4" />
        Log decision
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Log a decision</DialogTitle>
            <DialogDescription>
              Record what was decided, who decided it and why. This is the
              authoritative record for governance reviews.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. Reduce Woodseats chairs from 4 to 3"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="decision">Decision</Label>
              <Textarea
                id="decision"
                name="decision"
                placeholder="What was decided?"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rationale">Rationale</Label>
              <Textarea
                id="rationale"
                name="rationale"
                placeholder="Why was this decided? What were the alternatives?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
              <div className="grid gap-2">
                <Label htmlFor="siteId">Site (optional)</Label>
                <select id="siteId" name="siteId" defaultValue="" className={fieldClass()}>
                  <option value="">Group-wide</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="decidedBy">Decided by</Label>
                <Input id="decidedBy" name="decidedBy" placeholder="Name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="decidedOn">Decided on</Label>
                <Input id="decidedOn" name="decidedOn" type="date" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reviewDate">Review date (optional)</Label>
              <Input id="reviewDate" name="reviewDate" type="date" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log decision"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function StatusSelect({ id, value }: { id: number; value: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onChange(next: string | null) {
    if (!next) return
    setPending(true)
    try {
      const fd = new FormData()
      fd.set("id", String(id))
      fd.set("status", next)
      await setDecisionStatus(fd)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-[140px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {["Active", "Superseded", "Reversed"].map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function DecisionRegister({
  decisions,
  sites,
}: {
  decisions: DecisionRow[]
  sites: SiteOption[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {decisions.length} decision{decisions.length === 1 ? "" : "s"} on record
        </p>
        <AddDecisionDialog sites={sites} />
      </div>

      {decisions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Gavel className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No decisions logged yet</p>
          <p className="text-sm text-muted-foreground">
            Record key decisions so governance reviews have a clear audit trail.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {decisions.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-border bg-card p-4 md:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-card-foreground text-balance">
                    {d.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.functionArea}
                    {d.siteName ? ` · ${d.siteName}` : " · Group-wide"} · Decided
                    by {d.decidedBy} · {fmtDate(d.decidedOn)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_STYLE[d.status] ?? "border-border text-muted-foreground"
                    }`}
                  >
                    {d.status}
                  </span>
                  <StatusSelect id={d.id} value={d.status} />
                </div>
              </div>
              <p className="mt-3 text-sm text-foreground leading-relaxed">
                {d.decision}
              </p>
              {d.rationale ? (
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Rationale: </span>
                  {d.rationale}
                </p>
              ) : null}
              {d.reviewDate ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Review due {fmtDate(d.reviewDate)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
