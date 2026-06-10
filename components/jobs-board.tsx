"use client"

import type { ReactNode, ReactElement } from "react"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Sparkles,
  MapPin,
  Tag,
  Users,
  Copy,
  Check,
  Trash2,
  Megaphone,
  PoundSterling,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatCard } from "@/components/ui-bits"
import { fmtGBP } from "@/lib/format"
import type {
  JobPosting,
  JobReferral,
  SuggestedJob,
} from "@/lib/jobs"
import type { SiteOption } from "@/lib/data"
import {
  saveJob,
  saveAdvert,
  setJobStatus,
  deleteJob,
  deleteAllJobs,
  publishSuggestion,
  publishAllSuggestions,
  setReferralStatus,
  setBonusStatus,
} from "@/app/jobs/actions"
import { formatJobAdvert } from "@/lib/jobs-format"

const ROLE_OPTIONS = [
  "Manager",
  "Senior Barber",
  "Barber",
  "Junior Barber",
  "Apprentice",
  "Trainer",
  "Assessor",
]
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Apprenticeship", "Contract"]

const STATUS_VARIANT: Record<string, string> = {
  open: "bg-rag-green/15 text-rag-green border-rag-green/30",
  filled: "bg-muted text-muted-foreground border-border",
  closed: "bg-muted text-muted-foreground border-border",
}
const BONUS_VARIANT: Record<string, string> = {
  pending: "bg-rag-amber/15 text-rag-amber border-rag-amber/30",
  approved: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  paid: "bg-rag-green/15 text-rag-green border-rag-green/30",
  void: "bg-muted text-muted-foreground border-border",
}

type ReferralWithJob = JobReferral & { jobTitle: string }

export function JobsBoard({
  jobs,
  suggestions,
  referrals,
  bonusTotals,
  sites,
}: {
  jobs: JobPosting[]
  suggestions: SuggestedJob[]
  referrals: ReferralWithJob[]
  bonusTotals: { pending: number; approved: number; paid: number }
  sites: SiteOption[]
}) {
  const openCount = jobs.filter((j) => j.status === "open").length
  const totalReferrals = referrals.length
  const hires = referrals.filter((r) => r.status === "hired").length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open roles" value={openCount} sub={`${jobs.length} total`} />
        <StatCard label="Referrals" value={totalReferrals} sub={`${hires} hired`} />
        <StatCard
          label="Bonuses owed"
          value={fmtGBP(bonusTotals.pending + bonusTotals.approved)}
          sub={`${fmtGBP(bonusTotals.approved)} approved`}
        />
        <StatCard label="Bonuses paid" value={fmtGBP(bonusTotals.paid)} />
      </div>

      <Tabs defaultValue="postings">
        <TabsList>
          <TabsTrigger value="postings">Postings ({jobs.length})</TabsTrigger>
          <TabsTrigger value="suggestions">
            Suggestions ({suggestions.length})
          </TabsTrigger>
          <TabsTrigger value="referrals">
            Referrals ({totalReferrals})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="postings" className="mt-4">
          <div className="mb-4 flex items-center justify-end gap-2">
            {jobs.length > 0 && <DeleteAllJobs count={jobs.length} />}
            <JobDialog sites={sites} />
          </div>
          {jobs.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title="No postings yet"
              body="Add a job by hand, or publish a suggestion derived from your role gaps and opening pipeline."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} sites={sites} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          {suggestions.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="Nothing to suggest"
              body="Every current role gap and pipeline role is already on the board, or all shops are fully staffed."
            />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  These {suggestions.length} role{suggestions.length === 1 ? "" : "s"} are derived from
                  your current staffing gaps and opening pipeline. Publish them
                  individually, or load them all onto the board at once.
                </p>
                <LoadAllSuggestions count={suggestions.length} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {suggestions.map((s) => (
                  <SuggestionCard key={s.sourceKey} suggestion={s} />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <ReferralsTable referrals={referrals} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{body}</p>
    </div>
  )
}

function JobCard({ job, sites }: { job: JobPosting; sites: SiteOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function changeStatus(status: "open" | "closed" | "filled") {
    startTransition(async () => {
      await setJobStatus(job.id, status)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{job.title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {job.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.location}
              </span>
            )}
            {job.brand && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {job.brand}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {job.referralCount} referral{job.referralCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <Badge
          variant="outline"
          className={STATUS_VARIANT[job.status] ?? ""}
        >
          {job.status}
        </Badge>
      </div>

      {job.description && (
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {job.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs">
        <Badge variant="outline" className="font-normal">
          {job.employmentType}
        </Badge>
        {job.finderBonus > 0 && (
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <PoundSterling className="h-3 w-3" />
            {fmtGBP(job.finderBonus)} finder&apos;s bonus
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <JobDialog sites={sites} job={job} />
        <AdvertDialog job={job} />
        <Select
          value={job.status}
          onValueChange={(v) => changeStatus(v as "open" | "closed" | "filled")}
        >
          <SelectTrigger className="h-8 w-28 text-xs" disabled={pending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="filled">Filled</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:border-rag-red hover:text-rag-red"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            }
            title="Delete this posting?"
            description="This removes the posting and any referrals attached to it. This cannot be undone."
            onConfirm={async () => {
              await deleteJob(job.id)
              router.refresh()
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function JobDeleteButton({ job }: { job: JobPosting }) {
  const router = useRouter()

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs text-muted-foreground hover:border-rag-red hover:text-rag-red"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      }
      title={`Delete the "${job.title}" posting?`}
      description="This removes the posting and any referrals attached to it. This cannot be undone."
      onConfirm={async () => {
        await deleteJob(job.id)
        router.refresh()
      }}
    />
  )
}

function LoadAllSuggestions({ count }: { count: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function loadAll() {
    setError(null)
    startTransition(async () => {
      const res = await publishAllSuggestions()
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button size="sm" onClick={loadAll} disabled={pending} className="shrink-0">
        <Sparkles className="h-4 w-4" />
        {pending ? "Loading…" : `Load all ${count} jobs`}
      </Button>
      {error && <p className="text-xs text-rag-red">{error}</p>}
    </div>
  )
}

/** Reusable confirmation dialog built on the existing Dialog primitives.
 *  Replaces window.confirm(), which is unreliable inside the preview iframe. */
function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  pendingLabel = "Deleting…",
  onConfirm,
}: {
  trigger: ReactNode
  title: string
  description: string
  confirmLabel?: string
  pendingLabel?: string
  onConfirm: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      await onConfirm()
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={pending}
            className="bg-rag-red text-white hover:bg-rag-red/90"
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteAllJobs({ count }: { count: number }) {
  const router = useRouter()

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="text-muted-foreground hover:text-rag-red"
        >
          <Trash2 className="h-4 w-4" />
          Delete all
        </Button>
      }
      title={`Delete all ${count} posting${count === 1 ? "" : "s"}?`}
      description="This permanently removes every posting and its referrals. This cannot be undone."
      confirmLabel="Delete all"
      pendingLabel="Clearing…"
      onConfirm={async () => {
        await deleteAllJobs()
        router.refresh()
      }}
    />
  )
}

function SuggestionCard({ suggestion }: { suggestion: SuggestedJob }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function publish() {
    setError(null)
    startTransition(async () => {
      const res = await publishSuggestion(suggestion.sourceKey)
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {suggestion.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {suggestion.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {suggestion.location}
              </span>
            )}
            {suggestion.brand && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {suggestion.brand}
              </span>
            )}
          </div>
        </div>
        <Badge variant="outline" className="capitalize">
          {suggestion.source === "gap" ? "Current gap" : "Pipeline"}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {suggestion.description}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {suggestion.count} needed · {fmtGBP(suggestion.suggestedBonus)} bonus
        </span>
        <Button size="sm" className="h-8" onClick={publish} disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? "Publishing…" : "Publish"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-rag-red">{error}</p>}
    </div>
  )
}

function ReferralsTable({ referrals }: { referrals: ReferralWithJob[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (referrals.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="No referrals yet"
        body="When staff refer candidates against open jobs, they'll appear here for review and finder-bonus payment."
      />
    )
  }

  function refStatus(id: number, status: JobReferral["status"]) {
    startTransition(async () => {
      await setReferralStatus(id, status)
      router.refresh()
    })
  }
  function bonus(id: number, status: JobReferral["bonusStatus"]) {
    startTransition(async () => {
      await setBonusStatus(id, status)
      router.refresh()
    })
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Finder</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Bonus</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {referrals.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium text-foreground">
                  {r.candidateName}
                </div>
                {r.candidateContact && (
                  <div className="text-xs text-muted-foreground">
                    {r.candidateContact}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.jobTitle}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.finderName ?? "—"}
              </TableCell>
              <TableCell>
                <Select
                  value={r.status}
                  onValueChange={(v) =>
                    refStatus(r.id, v as JobReferral["status"])
                  }
                >
                  <SelectTrigger className="h-8 w-32 text-xs" disabled={pending}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="interviewing">Interviewing</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={BONUS_VARIANT[r.bonusStatus] ?? ""}
                  >
                    {r.bonusStatus}
                  </Badge>
                  {r.bonusAmount != null && (
                    <span className="text-xs text-muted-foreground">
                      {fmtGBP(r.bonusAmount)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {r.bonusStatus === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={pending}
                      onClick={() => bonus(r.id, "approved")}
                    >
                      Approve
                    </Button>
                  )}
                  {(r.bonusStatus === "approved" ||
                    r.bonusStatus === "pending") && (
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={pending}
                      onClick={() => bonus(r.id, "paid")}
                    >
                      Mark paid
                    </Button>
                  )}
                  {r.bonusStatus === "paid" && (
                    <span className="inline-flex items-center gap-1 text-xs text-rag-green">
                      <Check className="h-3.5 w-3.5" />
                      Paid
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function fieldClass() {
  return "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
}

export function JobDialog({
  sites,
  job,
}: {
  sites: SiteOption[]
  job?: JobPosting
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = Boolean(job)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const siteRaw = formData.get("siteId")
    const res = await saveJob({
      id: job?.id,
      title: String(formData.get("title") ?? ""),
      siteId: siteRaw && siteRaw !== "none" ? Number(siteRaw) : null,
      location: String(formData.get("location") ?? ""),
      brand: String(formData.get("brand") ?? ""),
      role: String(formData.get("role") ?? ""),
      description: String(formData.get("description") ?? ""),
      employmentType: String(formData.get("employmentType") ?? "Full-time"),
      finderBonus: Number(formData.get("finderBonus") ?? 0),
    })
    setPending(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          editing ? (
            <Button variant="outline" size="sm" className="h-8 text-xs" />
          ) : (
            <Button size="sm" />
          )
        }
      >
        {editing ? (
          "Edit"
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Add job
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit posting" : "New posting"}</DialogTitle>
          <DialogDescription>
            This advert is shown to staff on their jobs board and can be reused
            on social media.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Job title</Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={job?.title}
              placeholder="e.g. Senior Barber — Shoreditch"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                name="role"
                defaultValue={job?.role ?? ""}
                className={fieldClass()}
              >
                <option value="">—</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="employmentType">Employment type</Label>
              <select
                id="employmentType"
                name="employmentType"
                defaultValue={job?.employmentType ?? "Full-time"}
                className={fieldClass()}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                defaultValue={job?.location ?? ""}
                placeholder="e.g. Shoreditch"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                name="brand"
                defaultValue={job?.brand ?? ""}
                placeholder="e.g. Less Than Zero"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="siteId">Link to site (optional)</Label>
              <select
                id="siteId"
                name="siteId"
                defaultValue={job?.siteId ? String(job.siteId) : "none"}
                className={fieldClass()}
              >
                <option value="none">— None —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="finderBonus">Finder&apos;s bonus (£)</Label>
              <Input
                id="finderBonus"
                name="finderBonus"
                type="number"
                min={0}
                step={50}
                defaultValue={job?.finderBonus ?? 0}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Job description</Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={job?.description ?? ""}
              placeholder="Describe the role, the shop, and what you're looking for."
            />
          </div>

          {error && <p className="text-sm text-rag-red">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create posting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AdvertDialog({ job }: { job: JobPosting }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The auto-generated advert (from posting fields) is the fallback/default.
  const generated = formatJobAdvert(job)
  // What's shown/edited: a saved manual edit if present, else the generated copy.
  const [draft, setDraft] = useState(job.advertText?.trim() ? job.advertText : generated)
  const isCustom = Boolean(job.advertText?.trim())

  // Re-sync the draft whenever the dialog is (re)opened so it reflects the
  // latest saved state and any field edits made via the Edit dialog.
  function onOpenChange(next: boolean) {
    if (next) {
      setError(null)
      setCopied(false)
      setDraft(job.advertText?.trim() ? job.advertText : generated)
    }
    setOpen(next)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await saveAdvert(job.id, draft)
      if (res.ok) {
        router.refresh()
        setOpen(false)
      } else {
        setError(res.error)
      }
    })
  }

  function resetToAuto() {
    setDraft(generated)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="h-8 text-xs" />}
      >
        <Megaphone className="h-3.5 w-3.5" />
        Advert
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit advert</DialogTitle>
          <DialogDescription>
            Fine-tune the copy below, then save it or copy it to your social
            channels or careers page.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={14}
          className="max-h-[50vh] resize-y whitespace-pre-wrap text-xs leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">
          {isCustom
            ? "This advert has been edited manually."
            : "Auto-generated from the posting details. Edit and save to customise."}
        </p>
        {error && <p className="text-sm text-rag-red">{error}</p>}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={resetToAuto}
              disabled={pending || draft === generated}
            >
              Reset to auto
            </Button>
            <Button variant="outline" onClick={copy} disabled={pending}>
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save advert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
