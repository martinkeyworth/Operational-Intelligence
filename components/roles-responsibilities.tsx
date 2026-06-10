"use client"

import { useState } from "react"
import {
  Crown,
  Building2,
  Users2,
  Scissors,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleAlert,
} from "lucide-react"
import { TIER_ORDER, type RoleDef, type RoleStatus, type RoleTier } from "@/lib/roles"
import { findFunctionArea } from "@/lib/function-areas"

const TIER_META: Record<RoleTier, { icon: typeof Crown; blurb: string }> = {
  Board: { icon: Crown, blurb: "Ownership, vision and final sign-off" },
  Leadership: { icon: Building2, blurb: "Directors accountable for each remit" },
  Management: { icon: Users2, blurb: "Run the sites and the academy day to day" },
  Frontline: { icon: Scissors, blurb: "Deliver the service and learn the craft" },
}

const STATUS_META: Record<
  RoleStatus,
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  active: {
    label: "JD loaded",
    icon: CircleCheck,
    className: "bg-rag-green/15 text-rag-green",
  },
  drafted: {
    label: "Drafted — to confirm",
    icon: CircleDashed,
    className: "bg-rag-amber/15 text-rag-amber",
  },
  outstanding: {
    label: "JD outstanding",
    icon: CircleAlert,
    className: "bg-rag-red/15 text-rag-red",
  },
}

/**
 * Roles & Responsibilities library. Renders the org from board to frontline,
 * each role's purpose, remit, KPIs and reporting line, and which function areas
 * it owns — the single source of truth behind action auto-assignment.
 */
export function RolesResponsibilities({ roles }: { roles: RoleDef[] }) {
  const byTier = TIER_ORDER.map((tier) => ({
    tier,
    roles: roles.filter((r) => r.tier === tier),
  })).filter((g) => g.roles.length > 0)

  const counts = {
    active: roles.filter((r) => r.status === "active").length,
    drafted: roles.filter((r) => r.status === "drafted").length,
    outstanding: roles.filter((r) => r.status === "outstanding").length,
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          Roles &amp; Responsibilities
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Who owns what across Less Than Zero — from board to frontline. These
          remits drive how new and auto-raised actions are assigned to an owner.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <StatusPill status="active" count={counts.active} />
          <StatusPill status="drafted" count={counts.drafted} />
          <StatusPill status="outstanding" count={counts.outstanding} />
        </div>
      </div>

      {byTier.map((group) => {
        const TierIcon = TIER_META[group.tier].icon
        return (
          <section key={group.tier} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <TierIcon className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {group.tier}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {TIER_META[group.tier].blurb}
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {group.roles.map((role) => (
                <RoleCard key={role.key} role={role} allRoles={roles} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function StatusPill({ status, count }: { status: RoleStatus; count: number }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {count} {meta.label}
    </span>
  )
}

function RoleCard({ role, allRoles }: { role: RoleDef; allRoles: RoleDef[] }) {
  const [open, setOpen] = useState(false)
  const meta = STATUS_META[role.status]
  const StatusIcon = meta.icon
  const reportsTo = role.reportsTo
    ? allRoles.find((r) => r.key === role.reportsTo)?.title
    : null

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{role.title}</h4>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}
            >
              <StatusIcon className="h-3 w-3" />
              {meta.label}
            </span>
          </div>
          {role.holderName && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Held by{" "}
              <span className="font-medium text-foreground">
                {role.holderName}
              </span>
            </p>
          )}
          {reportsTo && (
            <p className="text-xs text-muted-foreground">Reports to {reportsTo}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse role detail" : "Expand role detail"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">
        {role.purpose}
      </p>

      {role.ownsAreas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {role.ownsAreas.map((areaKey) => {
            const label = findFunctionArea(areaKey)?.label ?? areaKey
            return (
              <span
                key={areaKey}
                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground"
              >
                {label}
              </span>
            )
          })}
        </div>
      )}

      {open && (
        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Responsibilities
            </p>
            <ul className="flex flex-col gap-1.5">
              {role.responsibilities.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-xs leading-relaxed text-foreground"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          {role.kpis && role.kpis.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Held to
              </p>
              <div className="flex flex-wrap gap-1.5">
                {role.kpis.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
