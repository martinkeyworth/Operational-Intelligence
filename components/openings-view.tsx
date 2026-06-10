"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  MapPin,
  Tag,
  PoundSterling,
  UserPlus,
  Briefcase,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { StatCard } from "@/components/ui-bits"
import { fmtGBP } from "@/lib/format"
import type { JobPosting, JobReferral } from "@/lib/jobs"
import { submitReferral } from "@/app/jobs/actions"

export function OpeningsView({
  jobs,
  myReferrals,
}: {
  jobs: JobPosting[]
  myReferrals: JobReferral[]
}) {
  const myHires = myReferrals.filter((r) => r.status === "hired").length
  const myEarned = myReferrals
    .filter((r) => r.bonusStatus === "paid")
    .reduce((a, r) => a + (r.bonusAmount ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open roles" value={jobs.length} />
        <StatCard label="Your referrals" value={myReferrals.length} />
        <StatCard label="Your hires" value={myHires} />
        <StatCard label="Bonus earned" value={fmtGBP(myEarned)} />
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Briefcase className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">
            No open roles right now
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Check back soon — new vacancies are posted here as the group grows.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((job) => {
            const mine = myReferrals.filter((r) => r.jobId === job.id)
            return <OpeningCard key={job.id} job={job} myReferrals={mine} />
          })}
        </div>
      )}
    </div>
  )
}

function OpeningCard({
  job,
  myReferrals,
}: {
  job: JobPosting
  myReferrals: JobReferral[]
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{job.title}</h3>
        {job.finderBonus > 0 && (
          <Badge
            variant="outline"
            className="border-rag-green/30 bg-rag-green/15 text-rag-green"
          >
            <PoundSterling className="mr-0.5 h-3 w-3" />
            {fmtGBP(job.finderBonus)}
          </Badge>
        )}
      </div>

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
        <Badge variant="outline" className="h-5 font-normal">
          {job.employmentType}
        </Badge>
      </div>

      {job.description && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {job.description}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <ReferDialog job={job} />
        {myReferrals.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-rag-green" />
            You referred {myReferrals.length}
          </span>
        )}
      </div>
    </div>
  )
}

function ReferDialog({ job }: { job: JobPosting }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function action(formData: FormData) {
    setPending(true)
    setError(null)
    formData.set("jobId", String(job.id))
    const res = await submitReferral(formData)
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
          <Button size="sm">
            <UserPlus className="h-4 w-4" />
            Refer someone
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refer a candidate</DialogTitle>
          <DialogDescription>
            {job.title}
            {job.finderBonus > 0
              ? ` · earn ${fmtGBP(job.finderBonus)} if they're hired`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="candidateName">Candidate name</Label>
            <Input id="candidateName" name="candidateName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="candidateContact">Contact (phone or email)</Label>
            <Input
              id="candidateContact"
              name="candidateContact"
              placeholder="So we can get in touch"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Why they'd be a great fit</Label>
            <Textarea id="note" name="note" rows={3} />
          </div>
          {error && <p className="text-sm text-rag-red">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Submit referral"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
