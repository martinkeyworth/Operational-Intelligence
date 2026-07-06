"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CalendarDays, CheckCircle2, AlertTriangle } from "lucide-react"
import { decideLeaveScoped } from "@/app/team/actions"

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

function fmt(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function ApprovalsList({ items }: { items: ApprovalItem[] }) {
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

  if (items.length === 0) {
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
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
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
  )
}
