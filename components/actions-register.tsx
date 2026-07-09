"use client"

import { useState } from "react"
import { ListChecks, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatCard } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { ActionsTable } from "@/components/actions-table"
import { OperationsActionCard } from "@/components/operations-action-card"
import { AddActionDialog } from "@/components/add-action-dialog"
import { ProposedActionsPanel } from "@/components/proposed-actions-panel"
import type { ActionRow, AssignableOwner, RiskRegister } from "@/lib/data"
import type { SiteOption } from "@/lib/registers-types"
import { User } from "lucide-react"

type View = "all" | "owner"

/**
 * Unified Actions & Risks surface. Replaces the separate Action Register and
 * Risk Register pages: a single editable register with a flat table view and a
 * "by owner" view (the working agenda for the weekly operational meeting).
 * Every edit — owner, due date, RAG, status, risk flag — writes straight back
 * to the shared action register regardless of which view is active.
 */
export function ActionsRegister({
  actions,
  register,
  owners,
  sites,
  focusId,
}: {
  actions: ActionRow[]
  register: RiskRegister
  owners: AssignableOwner[]
  sites: SiteOption[]
  focusId?: number | null
}) {
  // When deep-linked to a specific action (e.g. from the dashboard's Key Risks
  // panel), open on the flat table so the focused row can be highlighted.
  const [view, setView] = useState<View>("all")

  // AI-drafted actions (status "Proposed") are shown in their own review panel,
  // not mixed into the live register until a leader accepts them.
  const proposed = actions.filter((a) => a.status === "Proposed")
  const liveActions = actions.filter((a) => a.status !== "Proposed")

  return (
    <div className="space-y-6">
      <ProposedActionsPanel proposed={proposed} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Live actions" value={register.total} />
        <StatCard label="Open" value={register.open} />
        <StatCard label="Flagged risks" value={register.riskCount} />
        <StatCard
          label="Unassigned"
          value={register.unassigned}
          sub={
            register.unassigned > 0
              ? "Assign an owner"
              : "All actions have an owner"
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Action register view"
          className="inline-flex items-center gap-1 rounded-lg bg-muted p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            onClick={() => setView("all")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
              view === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ListChecks className="h-3.5 w-3.5" />
            All actions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "owner"}
            onClick={() => setView("owner")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
              view === "owner"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="h-3.5 w-3.5" />
            By owner
          </button>
        </div>

        <AddActionDialog owners={owners} sites={sites} />
      </div>

      {view === "all" ? (
        <ActionsTable actions={liveActions} owners={owners} focusId={focusId} />
      ) : register.groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No live actions. New actions you raise will appear here grouped by
          their assigned owner for the weekly operational meeting.
        </Card>
      ) : (
        <div className="space-y-5">
          {register.groups.map((group) => (
            <section
              key={group.ownerUserId ?? "unassigned"}
              className="space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <User className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">
                  {group.ownerName}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {group.risks.length} action
                  {group.risks.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-2">
                {group.risks.map((r) => (
                  <OperationsActionCard key={r.id} action={r} owners={owners} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
