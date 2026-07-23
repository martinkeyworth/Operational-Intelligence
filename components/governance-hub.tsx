"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { ListChecks, Gavel, Activity as ActivityIcon, CalendarClock, Network, Layers } from "lucide-react"
import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ActionsRegister } from "@/components/actions-register"
import { DecisionRegister } from "@/components/decision-register"
import { ActivityTracker } from "@/components/activity-tracker"
import { CadencePanel, type CadenceCeremony } from "@/components/cadence-panel"
import { RolesResponsibilities } from "@/components/roles-responsibilities"
import { getRoles } from "@/lib/roles"
import type { ActionRow, AssignableOwner, RiskRegister } from "@/lib/data"
import type {
  ActivitySummary,
  DecisionRow,
  SiteOption,
} from "@/lib/registers-types"

// Lead with the two things leaders act on every week; everything else is
// reference material tucked behind "Advanced" so the surface isn't overwhelming.
const TABS = [
  { value: "actions", label: "Actions & Risks", icon: ListChecks },
  { value: "advanced", label: "Advanced", icon: Layers },
] as const

// Sub-sections inside Advanced (the old peer tabs).
const ADVANCED = [
  { value: "decisions", label: "Decisions", icon: Gavel },
  { value: "activity", label: "Activity", icon: ActivityIcon },
  { value: "roles", label: "Roles", icon: Network },
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
  // Deep links to an old peer tab (decisions/activity/roles/cadence) resolve to
  // the Advanced section, opened on that sub-section.
  const isAdvancedSub = ADVANCED.some((t) => t.value === tab)
  const value = tab === "actions" ? "actions" : isAdvancedSub || tab === "advanced" ? "advanced" : "actions"
  const [advancedSub, setAdvancedSub] = useState<string>(
    isAdvancedSub ? tab : "decisions",
  )
  const focusId = Number(searchParams.get("focus")) || null

  function onValueChange(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", next === "advanced" ? advancedSub : next)
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
          focusId={focusId}
        />
      </TabsContent>

      <TabsContent value="advanced" className="pt-2">
        <p className="mb-3 text-xs text-muted-foreground">
          Reference material — decisions log, activity, roles and the review
          cadence. You don&apos;t need these day to day.
        </p>
        <Tabs
          value={advancedSub}
          onValueChange={(next) => {
            setAdvancedSub(next)
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", next)
            router.replace(`/governance?${params.toString()}`, { scroll: false })
          }}
        >
          <div className="overflow-x-auto">
            <TabsList className="h-9">
              {ADVANCED.map((t) => {
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

          <TabsContent value="decisions" className="pt-2">
            <DecisionRegister decisions={decisions} sites={sites} />
          </TabsContent>
          <TabsContent value="activity" className="pt-2">
            <ActivityTracker summary={activity} sites={sites} />
          </TabsContent>
          <TabsContent value="roles" className="pt-2">
            <RolesResponsibilities roles={getRoles()} />
          </TabsContent>
          <TabsContent value="cadence" className="pt-2">
            <CadencePanel cadence={cadence} />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  )
}
