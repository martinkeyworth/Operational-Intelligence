import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { JobsBoard } from "@/components/jobs-board"
import {
  listJobs,
  getSuggestedJobs,
  getAllReferrals,
  getBonusTotals,
} from "@/lib/jobs"
import { getSiteOptions } from "@/lib/data"

export const metadata = {
  title: "Jobs Board",
}

export default async function JobsPage() {
  const user = await requireDashboard()
  const [jobs, suggestions, referrals, bonusTotals, sites] = await Promise.all([
    listJobs(),
    getSuggestedJobs(),
    getAllReferrals(),
    getBonusTotals(),
    getSiteOptions(),
  ])

  return (
    <AppShell user={user}>
      <PageHeader
        meta="People & HR"
        title="Jobs Board"
        subtitle="Advertise vacancies to the team and externally. Postings are suggested automatically from current role gaps and the opening pipeline, or added by hand. Pay a finder's bonus to whoever refers a successful hire."
      />
      <div className="px-5 py-6 md:px-8">
        <JobsBoard
          jobs={jobs}
          suggestions={suggestions}
          referrals={referrals}
          bonusTotals={bonusTotals}
          sites={sites}
        />
      </div>
    </AppShell>
  )
}
