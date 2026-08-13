"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CalendarDays, CheckCircle2, CalendarClock } from "lucide-react"
import { completeOneToOneScoped, rescheduleOneToOneScoped } from "@/app/one-to-one/actions"
import type { ManagerOneToOneReview } from "@/lib/team"

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function OneToOneReview({ review }: { review: ManagerOneToOneReview }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-balance text-xl font-semibold text-foreground">
          1-2-1 with {review.barber.name}
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Record your notes and mark the 1-2-1 complete. Once completed it is fixed and can&apos;t be
          changed.
        </p>
      </header>

      {review.scheduled && !done ? (
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> Scheduled for {fmt(review.scheduled.scheduledFor)}
          </p>

          <form
            className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end"
            action={(fd) => {
              setError(null)
              start(async () => {
                const res = await rescheduleOneToOneScoped(fd)
                if (!res?.ok) setError(res?.error ?? "Could not move this 1-2-1")
              })
            }}
          >
            <input type="hidden" name="id" value={review.scheduled.id} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="move-when" className="flex items-center gap-1.5 text-xs">
                <CalendarClock className="h-3.5 w-3.5" /> Move to a new date/time
              </Label>
              <Input
                id="move-when"
                name="scheduledFor"
                type="datetime-local"
                required
                className="text-base"
              />
            </div>
            <Button type="submit" variant="outline" disabled={pending} className="self-start sm:self-auto">
              {pending ? "Moving…" : "Move"}
            </Button>
          </form>

          <form
            className="mt-3 flex flex-col gap-3"
            action={(fd) => {
              setError(null)
              start(async () => {
                const res = await completeOneToOneScoped(fd)
                if (res?.ok) setDone(true)
                else setError(res?.error ?? "Something went wrong")
              })
            }}
          >
            <input type="hidden" name="id" value={review.scheduled.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">1-2-1 notes</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={6}
                required
                placeholder="What was discussed, actions agreed, follow-ups…"
                className="text-base"
              />
            </div>
            {error && <p className="text-sm text-rag-red">{error}</p>}
            <Button type="submit" disabled={pending} className="gap-1.5 self-start">
              <CheckCircle2 className="h-4 w-4" /> {pending ? "Saving…" : "Mark 1-2-1 complete"}
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-sm text-rag-green">
            <CheckCircle2 className="h-4 w-4" />
            {done
              ? "1-2-1 completed — thank you."
              : "No 1-2-1 is currently scheduled to complete."}
          </p>
        </Card>
      )}

      {review.history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Previous 1-2-1s</h2>
          <ul className="flex flex-col gap-2">
            {review.history.map((h) => (
              <li key={h.id} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">{fmt(h.completedAt ?? h.scheduledFor)}</p>
                {h.notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{h.notes}</p>
                ) : (
                  <p className="mt-1 text-sm italic text-muted-foreground">No notes recorded.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
