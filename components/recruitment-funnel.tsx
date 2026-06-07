"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, UserSearch, PhoneCall } from "lucide-react"
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
  createCandidate,
  setCandidateStage,
  setCandidateStatus,
  logCandidateFollowUp,
} from "@/app/actions/registers"
import type {
  RecruitmentCandidateRow,
  RecruitmentFunnel,
  SiteOption,
} from "@/lib/registers"
import { RECRUITMENT_STAGES } from "@/lib/registers"
import type { AssignableOwner } from "@/lib/data"
import { StatCard } from "@/components/ui-bits"
import { fmtDate } from "@/lib/format"

function fieldClass() {
  return "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
}

const STAGE_COLOR = [
  "bg-sky-500/80",
  "bg-indigo-500/80",
  "bg-amber-500/80",
  "bg-emerald-500/80",
]

function AddCandidateDialog({
  sites,
  owners,
}: {
  sites: SiteOption[]
  owners: AssignableOwner[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function action(formData: FormData) {
    setPending(true)
    try {
      await createCandidate(formData)
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
        Add candidate
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Add a candidate</DialogTitle>
            <DialogDescription>
              Log a new recruitment contact. They enter the funnel at the
              &ldquo;Contacted&rdquo; stage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Candidate name" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" name="role" defaultValue="Barber" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="source">Source</Label>
                <Input id="source" name="source" placeholder="Referral, Indeed…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="siteId">Site (optional)</Label>
                <select id="siteId" name="siteId" defaultValue="" className={fieldClass()}>
                  <option value="">Unassigned</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ownerUserId">Owner</Label>
                <select
                  id="ownerUserId"
                  name="ownerUserId"
                  defaultValue=""
                  className={fieldClass()}
                >
                  <option value="">Unassigned</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" placeholder="Anything relevant" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add candidate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function StageControls({ candidate }: { candidate: RecruitmentCandidateRow }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function run(fn: () => Promise<void>) {
    setPending(true)
    try {
      await fn()
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const isClosed =
    candidate.status === "Rejected" || candidate.status === "Withdrawn"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={candidate.stage}
        disabled={pending || isClosed}
        onValueChange={(stage) =>
          run(async () => {
            const fd = new FormData()
            fd.set("id", String(candidate.id))
            fd.set("stage", String(stage))
            await setCandidateStage(fd)
          })
        }
      >
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RECRUITMENT_STAGES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={candidate.status}
        disabled={pending}
        onValueChange={(status) =>
          run(async () => {
            const fd = new FormData()
            fd.set("id", String(candidate.id))
            fd.set("status", String(status))
            await setCandidateStatus(fd)
          })
        }
      >
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["Active", "Rejected", "Withdrawn"].map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={pending || isClosed}
        onClick={() =>
          run(async () => {
            const fd = new FormData()
            fd.set("id", String(candidate.id))
            await logCandidateFollowUp(fd)
          })
        }
      >
        <PhoneCall className="h-3.5 w-3.5" />
        Follow-up
        {candidate.followUpCount > 0 ? ` (${candidate.followUpCount})` : ""}
      </Button>
    </div>
  )
}

export function RecruitmentFunnelView({
  funnel,
  sites,
  owners,
}: {
  funnel: RecruitmentFunnel
  sites: SiteOption[]
  owners: AssignableOwner[]
}) {
  const top = funnel.stages[0]?.count || 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="In pipeline" value={funnel.active} />
        <StatCard label="Hired" value={funnel.hired} />
        <StatCard
          label="Conversion"
          value={`${funnel.overallConversion}%`}
          sub="Contacted → Hired"
        />
        <StatCard label="Follow-ups logged" value={funnel.totalFollowUps} />
      </div>

      {/* Funnel bars */}
      <div className="rounded-lg border border-border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-card-foreground">
            Recruitment funnel
          </h3>
          <AddCandidateDialog sites={sites} owners={owners} />
        </div>
        <div className="mt-4 space-y-3">
          {funnel.stages.map((s, i) => {
            const pct = top > 0 ? Math.round((s.count / top) * 100) : 0
            return (
              <div key={s.stage} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
                  {s.stage}
                </div>
                <div className="h-7 flex-1 overflow-hidden rounded-md bg-secondary">
                  <div
                    className={`flex h-full items-center justify-end rounded-md px-2 ${STAGE_COLOR[i]}`}
                    style={{ width: `${Math.max(pct, 6)}%` }}
                  >
                    <span className="text-xs font-semibold text-white">
                      {s.count}
                    </span>
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                  {s.convFromPrev === null ? "—" : `${s.convFromPrev}%`}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Candidate list */}
      {funnel.candidates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <UserSearch className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No candidates yet</p>
          <p className="text-sm text-muted-foreground">
            Add your first recruitment contact to start tracking the funnel.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {funnel.candidates.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-card-foreground">
                    {c.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {c.role}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.siteName ?? "Unassigned"}
                    {c.source ? ` · ${c.source}` : ""} · Contacted{" "}
                    {fmtDate(c.contactedOn)}
                    {c.ownerName ? ` · Owner: ${c.ownerName}` : ""}
                  </p>
                </div>
                <StageControls candidate={c} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
