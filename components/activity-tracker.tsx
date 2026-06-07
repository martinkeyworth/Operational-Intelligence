"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Activity as ActivityIcon } from "lucide-react"
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
import { logActivity } from "@/app/actions/registers"
import type { ActivitySummary, SiteOption } from "@/lib/registers"
import { ACTIVITY_TYPES } from "@/lib/registers"
import { StatCard } from "@/components/ui-bits"
import { fmtDate } from "@/lib/format"

function fieldClass() {
  return "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
}

/** Default to the most recent Sunday (week-ending) date. */
function defaultWeekEnding() {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - day) // back to Sunday
  return d.toISOString().slice(0, 10)
}

function LogActivityDialog({ sites }: { sites: SiteOption[] }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [areaType, setAreaType] = useState(
    `${ACTIVITY_TYPES[0].area}::${ACTIVITY_TYPES[0].type}`,
  )
  const router = useRouter()

  async function action(formData: FormData) {
    const [area, type] = areaType.split("::")
    formData.set("functionArea", area)
    formData.set("activityType", type)
    setPending(true)
    try {
      await logActivity(formData)
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
        Log activity
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Log weekly activity</DialogTitle>
            <DialogDescription>
              Record the effort behind the numbers — posts, contacts, follow-ups
              and enquiries. These leading indicators predict next month&apos;s
              results.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="areaType">Activity</Label>
              <select
                id="areaType"
                value={areaType}
                onChange={(e) => setAreaType(e.target.value)}
                className={fieldClass()}
              >
                {ACTIVITY_TYPES.map((a) => (
                  <option key={`${a.area}::${a.type}`} value={`${a.area}::${a.type}`}>
                    {a.area} — {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="weekEnding">Week ending</Label>
                <Input
                  id="weekEnding"
                  name="weekEnding"
                  type="date"
                  defaultValue={defaultWeekEnding()}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="count">Count</Label>
                <Input
                  id="count"
                  name="count"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={0}
                  required
                />
              </div>
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
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" name="notes" placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ActivityTracker({
  summary,
  sites,
}: {
  summary: ActivitySummary
  sites: SiteOption[]
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {summary.weekEnding
            ? `Latest week ending ${fmtDate(summary.weekEnding)}`
            : "No activity logged yet"}
        </p>
        <LogActivityDialog sites={sites} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {summary.byType.map((t) => (
          <StatCard key={`${t.area}-${t.type}`} label={t.label} value={t.count} sub={t.area} />
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">
            Recent activity log
          </h3>
        </div>
        {summary.recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ActivityIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Nothing logged yet
            </p>
            <p className="text-sm text-muted-foreground">
              Start logging weekly effort to build the behaviour trend.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {summary.recent.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground">
                    {r.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.functionArea}
                    {r.siteName ? ` · ${r.siteName}` : " · Group-wide"} · w/e{" "}
                    {fmtDate(r.weekEnding)}
                  </p>
                </div>
                <span className="shrink-0 text-lg font-semibold tabular-nums text-foreground">
                  {r.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
