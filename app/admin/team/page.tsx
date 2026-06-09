import { requireTeamAdmin } from "@/lib/access"
import { PageHeader } from "@/components/ui-bits"
import { getTeamRoster } from "@/lib/team"
import { TeamRoster } from "@/components/team-roster"

export const dynamic = "force-dynamic"

export default async function TeamAdminPage() {
  await requireTeamAdmin()
  const roster = await getTeamRoster()

  return (
    <>
      <PageHeader
        meta="Admin"
        title="Team Area"
        subtitle="Your people at a glance — holiday, sickness, monthly 1-2-1s and 360 reviews. Tap a team member to manage their HR profile, link their login and run cadences."
      />
      <div className="px-5 py-6 md:px-8">
        <TeamRoster roster={roster} />
      </div>
    </>
  )
}
