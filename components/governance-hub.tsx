"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { ListChecks, Gavel, Activity as ActivityIcon, CalendarClock } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ActionsRegister } from "@/components/actions-register"
import { DecisionRegister } from "@/components/decision-register"
import { ActivityTracker } from "@/components/activity-tracker"
import { CadencePanel, type CadenceCeremony } from "@/components/cadence-panel"
import type { ActionRow, AssignableOwner, RiskRegister } from "@/lib/data"
import type {
  ActivitySummary,
  DecisionRow,
  SiteOption,
} from "@/lib/registers-types"

const TABS = [
  { value: "actions", label: "Actions & Risks", icon: ListChecks },
  { value: "decisions", label: "Decisions", icon: Gavel },
  { value: "activity", label: "Activity", icon: ActivityIcon },
  { value: "cadence", label: "Cadence", icon: CalendarClock },
] as const

/**
 * Governance hub. Collapses the previously separate Action Register, Risk
 * Register, Decision Register, Activity Tracker and Review Cadence pages into a
 * single tabbed surface. The active tab is reflected in the ?tab= query param
 * so deep links (and the old-route redirects) land on the right tab.
 */
export function GovernanceHub({
  actions,
  register,
  owners,
  sites,
  decisions,
  activity,
  cadence,
}: {
  actions: ActionRow[]
  register: RiskRegister
  owners: AssignableOwner[]
  sites: SiteOption[]
  decisions: DecisionRow[]
  activity: ActivitySummary
  cadence: CadenceCeremony[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") ?? "actions"
  const value = TABS.some((t) => t.value === tab) ? tab : "actions"

  function onValueChange(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", next)
    router.replace(`/governance?${params.toString()}`, { scroll: false })
  }

  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <div className="overflow-x-auto">
        <TabsList className="h-9">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3">
                <Icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>

      <TabsContent value="actions" className="pt-2">
        <ActionsRegister
          actions={actions}
          register={register}
          owners={owners}
          sites={sites}
        />
      </TabsContent>

      <TabsContent value="decisions" className="pt-2">
        <DecisionRegister decisions={decisions} sites={sites} />
      </TabsContent>

      <TabsContent value="activity" className="pt-2">
        <ActivityTracker summary={activity} sites={sites} />
      </TabsContent>

      <TabsContent value="cadence" className="pt-2">
        <CadencePanel cadence={cadence} />
      </TabsContent>
    </Tabs>
  )
}
