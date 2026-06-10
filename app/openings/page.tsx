import { requireUser } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { OpeningsView } from "@/components/openings-view"
import { listJobs, getReferralsForJob } from "@/lib/jobs"
import { getSiteOptions } from "@/lib/data"

export const metadata = {
  title: "Open Roles",
}

export default async function OpeningsPage() {
  const user = await requireUser()
  const canManage = user.canViewDashboard
  const jobs = await listJobs({ openOnly: true })
  const sites = canManage ? await getSiteOptions() : []

  // Pull this user's own referrals so they can see what they've submitted.
  const myReferrals = (
    await Promise.all(jobs.map((j) => getReferralsForJob(j.id)))
  )
    .flat()
    .filter((r) => r.finderUserId === user.id)

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Careers"
        title="Open Roles"
        subtitle="Vacancies across the group. Know someone who'd be a great fit? Refer them — if they're hired, you earn the finder's bonus shown on the role."
      />
      <div className="px-5 py-6 md:px-8">
        <OpeningsView
          jobs={jobs}
          myReferrals={myReferrals}
          canManage={canManage}
          sites={sites}
        />
      </div>
    </AppShell>
  )
}
