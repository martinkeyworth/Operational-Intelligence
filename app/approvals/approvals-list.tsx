"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CalendarDays, CheckCircle2, AlertTriangle, Pencil, Trash2, XCircle } from "lucide-react"
import { decideLeaveScoped, cancelLeave, changeHoliday } from "@/app/team/actions"

export type ApprovalItem = {
  id: number
  barberName: string
  startDate: string
  endDate: string
  days: number
  reason: string | null
  noticeDays: number
  isException: boolean
}

export type ApprovedHolidayItem = {
  id: number
  barberName: string
  startDate: string
  endDate: string
  days: number
}

function fmt(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function ApprovalsList({
  items,
  approved = [],
}: {
  items: ApprovalItem[]
  approved?: ApprovedHolidayItem[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  function decide(id: number, decision: "approve" | "decline") {
    setError(null)
    setBusyId(id)
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("decision", decision)
    start(async () => {
      const res = await decideLeaveScoped(fd)
      if (!res?.ok) setError(res?.error ?? "Something went wrong")
      setBusyId(null)
      router.refresh()
    })
  }

  if (items.length === 0 && approved.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          No holiday requests to review
        </p>
        <p className="text-pretty text-xs text-muted-foreground">
          When someone you manage requests holiday, it will appear here for you
          to approve or decline.
        </p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {items.length === 0 && (
        <p className="text-pretty text-xs text-muted-foreground">
          No pending requests to review.
        </p>
      )}
      {items.map((item) => (
        <Card key={item.id} className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">
                  {item.barberName}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {fmt(item.startDate)} &rarr; {fmt(item.endDate)} ·{" "}
                  {item.days} day{item.days === 1 ? "" : "s"}
                </p>
              </div>
              {item.isException ? (
                <Badge
                  variant="outline"
                  className="border-amber-500 bg-amber-500/10 text-amber-700"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Short notice — exception
                </Badge>
              ) : (
                <Badge variant="secondary">
                  {item.noticeDays} days&apos; notice
                </Badge>
              )}
            </div>

            {item.isException && (
              <p className="text-pretty rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                Policy is one month&apos;s notice. This request gives{" "}
                {item.noticeDays} day{item.noticeDays === 1 ? "" : "s"} — approve
                only at your discretion.
              </p>
            )}

            {item.reason && (
              <p className="text-pretty text-xs text-muted-foreground">
                Note: {item.reason}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => decide(item.id, "approve")}
                disabled={pending && busyId === item.id}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => decide(item.id, "decline")}
                disabled={pending && busyId === item.id}
              >
                Decline
              </Button>
            </div>
          </div>
        </Card>
      ))}
      </div>

      {approved.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Upcoming approved holiday
            </h2>
            <p className="text-pretty text-xs text-muted-foreground">
              Cancelling frees the day allowance and the shop&apos;s cover slot, and
              removes the shared-calendar entry. Changing the dates cancels this
              booking and sends the new dates back for approval.
            </p>
          </div>
          {approved.map((item) => (
            <ApprovedHolidayRow key={item.id} item={item} onDone={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  )
}

function ApprovedHolidayRow({
  item,
  onDone,
}: {
  item: ApprovedHolidayItem
  onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">{item.barberName}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {fmt(item.startDate)} &rarr; {fmt(item.endDate)} · {item.days} day
            {item.days === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => {
              setEditing((v) => !v)
              setConfirming(false)
              setError(null)
            }}
          >
            <Pencil className="h-3.5 w-3.5" /> Change
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => {
              if (!confirming) {
                setConfirming(true)
                setEditing(false)
                return
              }
              start(async () => {
                setError(null)
                const fd = new FormData()
                fd.set("id", String(item.id))
                const res = await cancelLeave(fd)
                if (!res?.ok) setError(res?.error ?? "Could not cancel")
                else onDone()
              })
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> {confirming ? "Confirm cancel" : "Cancel"}
          </Button>
        </div>
      </div>

      {confirming && !editing && (
        <p className="mt-2 text-xs text-muted-foreground">
          Tap &ldquo;Confirm cancel&rdquo; again to cancel this approved holiday.
        </p>
      )}

      {editing && (
        <form
          action={(fd) =>
            start(async () => {
              setError(null)
              fd.set("id", String(item.id))
              const res = await changeHoliday(fd)
              if (res?.ok) {
                setEditing(false)
                onDone()
              } else {
                setError(res?.error ?? "Could not change these dates")
              }
            })
          }
          className="mt-3 flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`ah-start-${item.id}`} className="text-xs">New from</Label>
              <Input
                id={`ah-start-${item.id}`}
                name="startDate"
                type="date"
                defaultValue={item.startDate}
                required
                className="text-base"
              />
            </div>
            <div>
              <Label htmlFor={`ah-end-${item.id}`} className="text-xs">New to</Label>
              <Input
                id={`ah-end-${item.id}`}
                name="endDate"
                type="date"
                defaultValue={item.endDate}
                className="text-base"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This cancels the approved booking and submits the new dates for approval.
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save new dates"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Keep as is
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </Card>
  )
}
