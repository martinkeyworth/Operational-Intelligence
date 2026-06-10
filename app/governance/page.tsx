import { Suspense } from "react"
import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { GovernanceHub } from "@/components/governance-hub"
import {
  getActions,
  getRiskRegister,
  getAssignableOwners,
} from "@/lib/data"
import {
  sweepAutoEscalations,
  getDecisions,
  getActivitySummary,
  getSiteOptions,
} from "@/lib/registers"
import { getReviewCadence } from "@/lib/cadence"

/**
 * Governance hub — one place for the full RAID model plus leading-indicator
 * activity and the review cadence. Replaces the separate /actions,
 * /operations, /decisions, /activity and /cadence pages with a single tabbed
 * surface. Deep-links via ?tab=actions|decisions|activity|cadence.
 */
export default async function GovernancePage() {
  const user = await requireDashboard()

  // Flag overdue / persistently-red actions on every visit (render-safe).
  await sweepAutoEscalations()

  const [actions, register, owners, decisions, activity, sites] =
    await Promise.all([
      getActions(),
      getRiskRegister(),
      getAssignableOwners(),
      getDecisions(),
      getActivitySummary(),
      getSiteOptions(),
    ])

  const cadence = getReviewCadence()

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Governance"
        title="Governance"
        subtitle="The full RAID picture in one place — actions, risks and decisions — plus the leading-indicator activity tracker and the review cadence that keeps the group accountable."
      />
      <div className="px-5 py-6 md:px-8">
        <Suspense fallback={null}>
          <GovernanceHub
            actions={actions}
            register={register}
            owners={owners}
            sites={sites}
            decisions={decisions}
            activity={activity}
            cadence={cadence}
          />
        </Suspense>
      </div>
    </AppShell>
  )
}
