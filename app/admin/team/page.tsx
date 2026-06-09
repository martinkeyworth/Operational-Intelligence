import { requireTeamAdmin } from "@/lib/access"
import { PageHeader } from "@/components/ui-bits"
import { getTeamRoster, getTeamKpis } from "@/lib/team"
import { TeamRoster } from "@/components/team-roster"
import { RagDot } from "@/components/rag"

export const dynamic = "force-dynamic"

export default async function TeamAdminPage() {
  await requireTeamAdmin()
  const [roster, kpis] = await Promise.all([getTeamRoster(), getTeamKpis()])

  return (
    <>
      <PageHeader
        meta="Admin"
        title="Team Area"
        subtitle="Your people at a glance — holiday, sickness, monthly 1-2-1s and 360 reviews. Tap a team member to manage their HR profile, link their login and run cadences."
      />
      <div className="px-5 py-6 md:px-8 flex flex-col gap-6">
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
