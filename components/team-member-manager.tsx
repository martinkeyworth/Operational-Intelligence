"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { RagDot } from "@/components/rag"
import { BarberRtbChart } from "@/components/barber-rtb-chart"
import {
  linkBarberUser,
  setManager,
  updateBarberProfile,
  decideLeave,
  scheduleOneToOneNow,
  completeOneToOne,
  openThreeSixtyCycle,
} from "@/app/admin/team/actions"
import type { getTeamMemberDetail } from "@/lib/team"

type Detail = NonNullable<Awaited<ReturnType<typeof getTeamMemberDetail>>>
type UserOpt = { id: string; name: string; email: string }

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function TeamMemberManager({
  detail,
  users,
  calendarEnabled = false,
}: {
  detail: Detail
  users: UserOpt[]
  calendarEnabled?: boolean
}) {
  const { self } = detail
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<unknown>) => start(async () => {
    await fn()
    router.refresh()
  })

  const pendingLeave = detail.recentLeave.filter(
    (l) => l.kind === "holiday" && l.status === "Pending",
  )

  return (
    <div className="space-y-4">
      {/* Snapshot */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Holiday left</p>
          <p className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <RagDot rag={self.holiday.rag} /> {self.holiday.remaining}/{self.holiday.allowance}d
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Sickness (year)</p>
          <p className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <RagDot rag={self.sickness.rag} /> {self.sickness.days}d
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Apprentice gate</p>
          <p className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            {self.apprentice ? (
              <>
                <RagDot rag={self.apprentice.rag} />
                {self.apprentice.pastGate ? "Past" : `${self.apprentice.daysToGate}d`}
              </>
            ) : (
              <span className="text-base font-normal text-muted-foreground">N/A</span>
            )}
          </p>
        </Card>
      </div>

      {/* RTB chart */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Weekly takings vs £500 RTB</h3>
        <div className="mt-3">
          <BarberRtbChart data={self.takings} />
        </div>
      </Card>

      {/* Link login + manager + profile */}
      <Card className="space-y-5 p-5">
        <h3 className="text-sm font-semibold text-foreground">Profile &amp; access</h3>

        <form
          action={(fd) => run(() => linkBarberUser(fd))}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="barberId" value={self.barber.id} />
          <div className="flex-1">
            <Label htmlFor="link" className="text-xs">Linked login (so they see their own data)</Label>
            <select
              id="link"
              name="userId"
              defaultValue={detail.userId ?? ""}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              <option value="">— Not linked —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Save link
          </Button>
        </form>

        <form
          action={(fd) => run(() => setManager(fd))}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="barberId" value={self.barber.id} />
          <div className="flex-1">
            <Label htmlFor="mgr" className="text-xs">1-2-1 manager</Label>
            <select
              id="mgr"
              name="managerUserId"
              defaultValue={detail.managerUserId ?? ""}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              <option value="">— No manager —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Save manager
          </Button>
        </form>

        <form action={(fd) => run(() => updateBarberProfile(fd))} className="space-y-3">
          <input type="hidden" name="barberId" value={self.barber.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="start" className="text-xs">Start date</Label>
              <Input
                id="start"
                name="startDate"
                type="date"
                defaultValue={self.barber.startDate ?? ""}
                className="text-base"
              />
            </div>
            <div>
              <Label htmlFor="allow" className="text-xs">Holiday allowance (days)</Label>
              <Input
                id="allow"
                name="holidayAllowance"
                type="number"
                min={0}
                defaultValue={detail.holidayAllowance}
                className="text-base"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox name="isApprentice" defaultChecked={self.barber.isApprentice} />
            Apprentice (tracked against 3-month cutting &amp; revenue gate)
          </label>
          <Button type="submit" size="sm" disabled={pending}>
            Save profile
          </Button>
        </form>
      </Card>

      {/* Pending holiday approvals */}
      {pendingLeave.length > 0 && (
        <Card className="space-y-3 p-5">
          <h3 className="text-sm font-semibold text-foreground">Holiday requests to review</h3>
          {pendingLeave.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="text-sm text-foreground">
                {fmtDate(l.startDate)} → {fmtDate(l.endDate)}{" "}
                <span className="text-muted-foreground">({l.days}d)</span>
                {l.reason ? <span className="text-muted-foreground"> · {l.reason}</span> : null}
              </span>
              <div className="flex gap-2">
                <form action={(fd) => run(() => decideLeave(fd))}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <Button type="submit" size="sm" disabled={pending}>Approve</Button>
                </form>
                <form action={(fd) => run(() => decideLeave(fd))}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <Button type="submit" size="sm" variant="ghost" disabled={pending}>
                    Decline
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Cadences: 1-2-1 + 360 */}
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold text-foreground">Cadences</h3>

        <form
          action={(fd) => run(() => scheduleOneToOneNow(fd))}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="barberId" value={self.barber.id} />
          <div className="flex-1">
            <Label htmlFor="when" className="text-xs">
              {calendarEnabled
                ? `Schedule next 1-2-1 (creates a Google Calendar event for ${self.barber.name.split(" ")[0]} & manager on the shared LTZ calendar)`
                : `Schedule next 1-2-1 (emails an .ics invite to ${self.barber.name.split(" ")[0]} & manager)`}
            </Label>
            <Input id="when" name="scheduledFor" type="datetime-local" className="text-base" />
          </div>
          <Button type="submit" size="sm" disabled={pending}>Schedule</Button>
        </form>

        <form action={(fd) => run(() => openThreeSixtyCycle(fd))}>
          <input type="hidden" name="barberId" value={self.barber.id} />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Open new 360 cycle
          </Button>
        </form>

        {detail.oneToOneHistory.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Recent 1-2-1s</p>
            {detail.oneToOneHistory.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="text-foreground">
                  {new Date(o.scheduledFor).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{o.status}</Badge>
                  {o.googleEventId && <RsvpBadge barber={o.barberResponse} manager={o.managerResponse} />}
                  {o.status === "Scheduled" && (
                    <form action={(fd) => run(() => completeOneToOne(fd))}>
                      <input type="hidden" name="id" value={o.id} />
                      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
                        Mark done
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/** Compact badge summarising Google Calendar RSVP for a 1-2-1. */
function RsvpBadge({ barber, manager }: { barber: string; manager: string }) {
  const label = (s: string) =>
    s === "accepted" ? "Accepted" : s === "declined" ? "Declined" : s === "tentative" ? "Maybe" : "No reply"
  // Worst-case headline: a decline shows red; both accepted shows green.
  const both = [barber, manager]
  const variant: "default" | "secondary" | "destructive" | "outline" = both.includes("declined")
    ? "destructive"
    : both.every((s) => s === "accepted")
      ? "default"
      : "outline"
  return (
    <Badge variant={variant} className="text-[10px]" title={`Barber: ${label(barber)} · Manager: ${label(manager)}`}>
      RSVP: {label(barber)}/{label(manager)}
    </Badge>
  )
}
