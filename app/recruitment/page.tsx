import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { RecruitmentFunnelView } from "@/components/recruitment-funnel"
import { getRecruitmentFunnel, getSiteOptions } from "@/lib/registers"
import { getAssignableOwners } from "@/lib/data"

export default async function RecruitmentPage() {
  const user = await requireDashboard()
  const [funnel, sites, owners] = await Promise.all([
    getRecruitmentFunnel(),
    getSiteOptions(),
    getAssignableOwners(),
  ])

  return (
    <AppShell user={user}>
      <PageHeader
        meta="People & HR"
        title="Recruitment Funnel"
        subtitle="Track candidates from first contact through interview, offer and hire. Conversion at each stage shows where recruitment is leaking, and follow-up activity is the leading indicator of effort."
      />
      <div className="px-5 py-6 md:px-8">
        <RecruitmentFunnelView funnel={funnel} sites={sites} owners={owners} />
      </div>
    </AppShell>
  )
}
