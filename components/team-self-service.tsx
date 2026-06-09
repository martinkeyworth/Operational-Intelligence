"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RagDot } from "@/components/rag"
import { CalendarDays, Plane, Thermometer, Users, CheckCircle2 } from "lucide-react"
import { requestHoliday, logSickness, submitThreeSixtyNominees } from "@/app/team/actions"
import type { SelfView } from "@/lib/team"

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function TeamSelfService({ self }: { self: SelfView }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <HolidayCard self={self} />
      <SicknessCard self={self} />
      <OneToOneCard self={self} />
      <ThreeSixtyCard self={self} />
    </div>
  )
}

function HolidayCard({ self }: { self: SelfView }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Holiday</h3>
        </div>
        <RagDot rag={self.holiday.rag} />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
        {self.holiday.remaining}
        <span className="text-sm font-normal text-muted-foreground">
          {" "}
          / {self.holiday.allowance} days left
        </span>
      </p>
      <p className="text-xs text-muted-foreground">{self.holiday.taken} days taken this year</p>

      {!open ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(true)}>
          Request holiday
        </Button>
      ) : (
        <form
          action={(fd) =>
            start(async () => {
              const res = await requestHoliday(fd)
              if (res?.ok) {
                setDone(true)
                setOpen(false)
              }
            })
          }
          className="mt-4 flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="h-start" className="text-xs">From</Label>
              <Input id="h-start" name="startDate" type="date" required className="text-base" />
            </div>
            <div>
              <Label htmlFor="h-end" className="text-xs">To</Label>
              <Input id="h-end" name="endDate" type="date" className="text-base" />
            </div>
          </div>
          <Textarea name="reason" placeholder="Optional note" rows={2} className="text-base" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Sending…" : "Submit request"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {done && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Request sent to leadership
        </p>
      )}
    </Card>
  )
}

function SicknessCard({ self }: { self: SelfView }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Sickness</h3>
        </div>
        <RagDot rag={self.sickness.rag} />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
        {self.sickness.days}
        <span className="text-sm font-normal text-muted-foreground"> days this year</span>
      </p>
      <p className="text-xs text-muted-foreground">5 = amber · 6+ = red</p>

      {!open ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(true)}>
          Log sickness
        </Button>
      ) : (
        <form
          action={(fd) =>
            start(async () => {
              const res = await logSickness(fd)
              if (res?.ok) {
                setDone(true)
                setOpen(false)
              }
            })
          }
          className="mt-4 flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="s-start" className="text-xs">From</Label>
              <Input id="s-start" name="startDate" type="date" required className="text-base" />
            </div>
            <div>
              <Label htmlFor="s-end" className="text-xs">To</Label>
              <Input id="s-end" name="endDate" type="date" className="text-base" />
            </div>
          </div>
          <Textarea name="reason" placeholder="Optional note" rows={2} className="text-base" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Log it"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {done && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Logged and leadership notified
        </p>
      )}
    </Card>
  )
}

function OneToOneCard({ self }: { self: SelfView }) {
  const next = self.nextOneToOne
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Monthly 1-2-1</h3>
      </div>
      {next ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">
            {next.scheduledFor.toLocaleString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            Status: {next.status} · a calendar invite was emailed to you
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Your next 1-2-1 will be scheduled automatically and emailed to you as a calendar invite.
        </p>
      )}
    </Card>
  )
}

function ThreeSixtyCard({ self }: { self: SelfView }) {
  const cycle = self.openCycle
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const allSubmitted = cycle && cycle.nominees.length === 5

  return (
    <Card className="p-5 md:col-span-2">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">360 Review</h3>
      </div>
      {!cycle ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No 360 cycle is open right now. A new cycle opens every 6 months — you&apos;ll nominate 5
          reviewers here.
        </p>
      ) : allSubmitted && !done ? (
        <div className="mt-3">
          <p className="text-sm text-foreground">
            Your 5 nominees for <strong>{cycle.period}</strong> have been invited (due{" "}
            {fmtDate(cycle.dueOn)}):
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {cycle.nominees.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs"
              >
                <span className="text-foreground">{n.name}</span>
                <span className="text-muted-foreground">{n.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Nominate 5 people to give you 360 feedback for <strong>{cycle.period}</strong> (due{" "}
            {fmtDate(cycle.dueOn)}). They&apos;ll be emailed automatically.
          </p>
          <form
            action={(fd) =>
              start(async () => {
                const res = await submitThreeSixtyNominees(fd)
                if (res?.ok) setDone(true)
              })
            }
            className="mt-4 flex flex-col gap-3"
          >
            <input type="hidden" name="cycleId" value={cycle.id} />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  name={`name_${i}`}
                  placeholder={`Reviewer ${i + 1} name`}
                  required
                  className="text-base"
                />
                <Input
                  name={`email_${i}`}
                  type="email"
                  placeholder="email@example.com"
                  required
                  className="text-base"
                />
              </div>
            ))}
            <div>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Sending invites…" : "Submit 5 nominees"}
              </Button>
            </div>
          </form>
        </>
      )}
      {done && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Nominees invited
        </p>
      )}
    </Card>
  )
}
