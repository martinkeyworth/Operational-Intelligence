import { requireTeamAdmin } from "@/lib/access"
import { PageHeader } from "@/components/ui-bits"
import { getTeamRoster, getTeamKpis } from "@/lib/team"
import { TeamRoster } from "@/components/team-roster"
import { RagDot } from "@/components/rag"
import { RunSchedulerButton } from "@/components/run-scheduler-button"
import { isCalendarConfigured } from "@/lib/google-calendar"
import { CalendarCheck, CalendarX } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function TeamAdminPage() {
  await requireTeamAdmin()
  const [roster, kpis] = await Promise.all([getTeamRoster(), getTeamKpis()])
  const calendarConnected = isCalendarConfigured()

  return (
    <>
      <PageHeader
        meta="Admin"
        title="Team Area"
        subtitle="Your people at a glance — holiday, sickness, monthly 1-2-1s and 360 reviews. Tap a team member to manage their HR profile, link their login and run cadences."
      />
      <div className="px-5 py-6 md:px-8 flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Cadence automation</p>
              <p className="text-xs text-muted-foreground">
                1-2-1s and 360s schedule themselves daily for barbers with a manager assigned. Run it now to catch up immediately.
              </p>
            </div>
            <RunSchedulerButton />
          </div>
          {calendarConnected ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium">Google Calendar connected.</span> New 1-2-1s create real events on the shared LTZ calendar and invite attendees directly.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <CalendarX className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium">Google Calendar not connected.</span> 1-2-1s currently fall back to emailing .ics invites. Add the GOOGLE_ environment variables in Project Settings to enable shared-calendar events.
              </span>
            </div>
          )}
        </div>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.code}
              className="rounded-lg border border-border bg-card p-4"
              title={k.help}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                <RagDot rag={k.rag} />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{k.value}</p>
            </div>
          ))}
        </section>
        <TeamRoster roster={roster} />
      </div>
    </>
  )
}
