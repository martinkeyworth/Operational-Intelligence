import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { TrainingFunnelView } from "@/components/training-funnel"
import { getTrainingFunnel, getSiteOptions } from "@/lib/registers"
import { getAssignableOwners } from "@/lib/data"

export default async function TrainingFunnelPage() {
  const user = await requireDashboard()
  const [funnel, sites, owners] = await Promise.all([
    getTrainingFunnel(),
    getSiteOptions(),
    getAssignableOwners(),
  ])

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Training & Academy"
        title="Training Funnel"
        subtitle="Track learners from first enquiry through enrolment, completion and placement. Conversion at each stage shows where academy demand is converting into trained, placed talent."
      />
      <div className="px-5 py-6 md:px-8">
        <TrainingFunnelView funnel={funnel} sites={sites} owners={owners} />
      </div>
    </AppShell>
  )
}
