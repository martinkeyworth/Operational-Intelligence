"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Building2,
  Landmark,
  PoundSterling,
  Flag,
  GraduationCap,
  TrendingUp,
  Pencil,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatCard } from "@/components/ui-bits"
import { fmtGBP } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  saveAssumption,
  saveSalary,
  saveMilestoneStatus,
} from "@/app/roadmap/actions"
import type {
  YearProjection,
  LeadershipSalary,
  Assumption,
  Milestone,
  MilestoneStatus,
  MilestoneCategory,
  RoadmapProgress,
  AcademyComparison,
} from "@/lib/roadmap"

const MONTHS = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

const STATUS_OPTIONS: MilestoneStatus[] = ["Planned", "In progress", "Done", "At risk"]

const STATUS_STYLES: Record<MilestoneStatus, string> = {
  Planned: "bg-muted text-muted-foreground",
  "In progress": "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  Done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "At risk": "bg-destructive/15 text-destructive",
}

const CATEGORY_ICON: Record<MilestoneCategory, typeof Building2> = {
  Expansion: Building2,
  Governance: Landmark,
  Finance: PoundSterling,
  Milestone: Flag,
}

const BRAND_DOT: Record<string, string> = {
  "Less Than Zero": "bg-chart-1",
  "F.AF": "bg-chart-2",
  Kairos: "bg-chart-4",
  "Velvet Ash": "bg-chart-3",
}

function fmtAssumption(a: Assumption): string {
  switch (a.unit) {
    case "gbp":
      return fmtGBP(a.value)
    case "pct":
      return `${Math.round(a.value * 100)}%`
    case "year":
      return String(a.value)
    case "months":
      return `${a.value} mo`
    default:
      return a.value.toLocaleString()
  }
}

export function RoadmapView({
  years,
  salaries,
  assumptions,
  milestones,
  progress,
  academy,
  canEditFinance,
}: {
  years: YearProjection[]
  salaries: LeadershipSalary[]
  assumptions: Assumption[]
  milestones: Milestone[]
  progress: RoadmapProgress
  academy: AcademyComparison
  canEditFinance: boolean
}) {
  const totalSalaries = salaries.reduce((s, r) => s + r.annualSalary, 0)

  return (
    <div className="space-y-6">
      {/* Headline progress */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Through the plan"
          value={`${progress.pctThroughPlan}%`}
          sub={`Year ${progress.yearsElapsed} of ${progress.yearsTotal} (2025–2030)`}
        />
        <StatCard
          label="Shops open"
          value={`${progress.shopsOpen} / ${progress.shopsPlanned}`}
          sub="Per the opening schedule"
        />
        <StatCard
          label="Barbering vs £5m goal"
          value={`${progress.pctToGoal}%`}
          sub={`${fmtGBP(progress.currentBarberingTarget)} planned this year`}
        />
        <StatCard
          label="Milestones delivered"
          value={`${progress.doneCount} / ${progress.totalCount}`}
          sub={
            progress.nextMilestone
              ? `Next: ${progress.nextMilestone.title}`
              : "All milestones complete"
          }
        />
      </div>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="projection">Projection</TabsTrigger>
          <TabsTrigger value="academy">Academy</TabsTrigger>
          <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
        </TabsList>

        {/* TIMELINE ------------------------------------------------------- */}
        <TabsContent value="timeline" className="mt-5">
          <Timeline milestones={milestones} canEdit />
        </TabsContent>

        {/* PROJECTION ----------------------------------------------------- */}
        <TabsContent value="projection" className="mt-5 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Turnover, profit & dividends (2025–2030)
              </h3>
            </div>
            <p className="mb-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Barbering turnover is taken from the board-approved plan. Academy
              revenue uses the corrected economics (see Academy tab). Operating
              profit, tax and dividends are indicative and recompute from the
              editable assumptions — placeholders are flagged there.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Shops</TableHead>
                    <TableHead className="text-right">Barbering</TableHead>
                    <TableHead className="text-right">Academy</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Leadership</TableHead>
                    <TableHead className="text-right">Pre-tax</TableHead>
                    <TableHead className="text-right">Post-tax</TableHead>
                    <TableHead className="text-right">Dividend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {years.map((y) => (
                    <TableRow key={y.year}>
                      <TableCell className="font-medium">{y.year}</TableCell>
                      <TableCell className="text-right tabular-nums">{y.shops}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtGBP(y.barberingTurnover)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtGBP(y.academyTurnover)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmtGBP(y.totalTurnover)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {y.leadershipCost ? `−${fmtGBP(y.leadershipCost)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtGBP(y.preTaxProfit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtGBP(y.postTaxProfit)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          y.dividend > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {y.dividend ? fmtGBP(y.dividend) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Leadership salaries */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Leadership salary schedule
              </h3>
              <span className="text-xs text-muted-foreground">
                Total {fmtGBP(totalSalaries)}/yr
              </span>
            </div>
            <p className="mb-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Performance-gated and deferred until the Q4 2026 board review.
              Salaries commence once profitability targets are met.
            </p>
            <SalaryTable salaries={salaries} canEdit={canEditFinance} />
          </div>
        </TabsContent>

        {/* ACADEMY -------------------------------------------------------- */}
        <TabsContent value="academy" className="mt-5">
          <AcademyCorrection academy={academy} />
        </TabsContent>

        {/* ASSUMPTIONS ---------------------------------------------------- */}
        <TabsContent value="assumptions" className="mt-5">
          <AssumptionsPanel assumptions={assumptions} canEdit={canEditFinance} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// --- Timeline --------------------------------------------------------------

function Timeline({
  milestones,
  canEdit,
}: {
  milestones: Milestone[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const byYear = milestones.reduce<Record<number, Milestone[]>>((acc, m) => {
    ;(acc[m.targetYear] ??= []).push(m)
    return acc
  }, {})
  const yearsSorted = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b)

  function onStatusChange(id: number, status: string) {
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("status", status)
    startTransition(async () => {
      await saveMilestoneStatus(fd)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {yearsSorted.map((year) => (
        <div key={year}>
          <div className="mb-3 flex items-center gap-3">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {year}
            </h3>
            <div className="h-px flex-1 bg-border" />
          </div>
          <ol className="space-y-2">
            {byYear[year]
              .sort((a, b) => (a.targetMonth ?? 0) - (b.targetMonth ?? 0))
              .map((m) => {
                const Icon = CATEGORY_ICON[m.category]
                return (
                  <li
                    key={m.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex w-16 shrink-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      {m.targetMonth ? MONTHS[m.targetMonth] : ""}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {m.brand && (
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              BRAND_DOT[m.brand] ?? "bg-muted-foreground",
                            )}
                            aria-hidden
                          />
                        )}
                        <p className="text-sm font-medium text-foreground">{m.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {m.category}
                        </Badge>
                      </div>
                      {m.detail && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {m.detail}
                        </p>
                      )}
                    </div>
                    {canEdit ? (
                      <Select
                        defaultValue={m.status}
                        onValueChange={(v) => v && onStatusChange(m.id, v)}
                        disabled={pending}
                      >
                        <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                          STATUS_STYLES[m.status],
                        )}
                      >
                        {m.status}
                      </span>
                    )}
                  </li>
                )
              })}
          </ol>
        </div>
      ))}
    </div>
  )
}

// --- Academy correction ----------------------------------------------------

function AcademyCorrection({ academy }: { academy: AcademyComparison }) {
  const last = academy.conservativeByYear[academy.conservativeByYear.length - 1]
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            The academy was modelled conservatively
          </h3>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The original plan treated the Training Academy as a flat revenue line
          growing 40% a year — based only on apprentice numbers and one trainee
          per shop. It never assumed the academy running at capacity: 5 learners
          per cohort, 3 cohorts a day, 5 days a week. At a steady{" "}
          <span className="font-medium text-foreground">75 active learners</span>{" "}
          each paying{" "}
          <span className="font-medium text-foreground">£1,200 per 3-month course</span>
          , the academy&apos;s real run-rate is far higher.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Conservative plan (2030)"
          value={fmtGBP(last?.value ?? 0)}
          sub="Original 40%-growth line"
        />
        <StatCard
          label="Corrected run-rate"
          value={fmtGBP(academy.correctedAnnual)}
          sub="75 learners × £1,200 × 4 courses/yr"
        />
        <StatCard
          label="Annual upside"
          value={`+${fmtGBP(academy.upsideVs2030)}`}
          sub="vs the 2030 conservative figure"
          className="border-emerald-500/30"
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Conservative academy line by year
        </h4>
        <div className="space-y-2">
          {academy.conservativeByYear.map((row) => {
            const pct = Math.round((row.value / academy.correctedAnnual) * 100)
            return (
              <div key={row.year} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {row.year}
                </span>
                <Progress value={pct} className="h-2 flex-1" />
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-foreground">
                  {fmtGBP(row.value)}
                </span>
              </div>
            )
          })}
          <div className="flex items-center gap-3 border-t border-border pt-2">
            <span className="w-10 shrink-0 text-xs font-medium tabular-nums text-foreground">
              Goal
            </span>
            <Progress value={100} className="h-2 flex-1" />
            <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
              {fmtGBP(academy.correctedAnnual)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Assumptions panel -----------------------------------------------------

function AssumptionsPanel({
  assumptions,
  canEdit,
}: {
  assumptions: Assumption[]
  canEdit: boolean
}) {
  return (
    <div className="space-y-3">
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          These figures drive the projection. Editing is limited to admins.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assumptions.map((a) => (
          <AssumptionCard key={a.key} assumption={a} canEdit={canEdit} />
        ))}
      </div>
    </div>
  )
}

function AssumptionCard({
  assumption: a,
  canEdit,
}: {
  assumption: Assumption
  canEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  // Percent assumptions are edited as whole numbers for usability.
  const [draft, setDraft] = useState(
    a.unit === "pct" ? String(Math.round(a.value * 100)) : String(a.value),
  )

  function save() {
    const raw = Number(draft)
    if (!Number.isFinite(raw)) return
    const value = a.unit === "pct" ? raw / 100 : raw
    const fd = new FormData()
    fd.set("key", a.key)
    fd.set("value", String(value))
    startTransition(async () => {
      await saveAssumption(fd)
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {a.label}
        </p>
        {a.isPlaceholder && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Placeholder
          </Badge>
        )}
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="decimal"
            className="h-9"
            aria-label={a.label}
          />
          <span className="text-xs text-muted-foreground">
            {a.unit === "pct" ? "%" : a.unit === "gbp" ? "£" : ""}
          </span>
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={save} disabled={pending}>
            <Check className="h-4 w-4" />
            <span className="sr-only">Save</span>
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {fmtAssumption(a)}
          </p>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="sr-only">Edit {a.label}</span>
            </Button>
          )}
        </div>
      )}

      {a.description && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {a.description}
        </p>
      )}
    </div>
  )
}

// --- Salary table ----------------------------------------------------------

function SalaryTable({
  salaries,
  canEdit,
}: {
  salaries: LeadershipSalary[]
  canEdit: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead>Holder</TableHead>
            <TableHead>Class</TableHead>
            <TableHead className="text-right">Salary</TableHead>
            <TableHead className="text-right">From</TableHead>
            {canEdit && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {salaries.map((s) => (
            <SalaryRow key={s.id} salary={s} canEdit={canEdit} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SalaryRow({
  salary: s,
  canEdit,
}: {
  salary: LeadershipSalary
  canEdit: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState(String(s.annualSalary))
  const [year, setYear] = useState(String(s.startYear))

  function save() {
    const fd = new FormData()
    fd.set("id", String(s.id))
    fd.set("annualSalary", amount)
    fd.set("startYear", year)
    startTransition(async () => {
      await saveSalary(fd)
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{s.role}</TableCell>
      <TableCell className="text-muted-foreground">{s.holder ?? "—"}</TableCell>
      <TableCell>
        {s.shareClass ? (
          <Badge variant="outline" className="text-[10px]">
            {s.shareClass}
          </Badge>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {editing ? (
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            className="ml-auto h-8 w-28 text-right"
            aria-label={`${s.role} salary`}
          />
        ) : (
          fmtGBP(s.annualSalary)
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {editing ? (
          <Input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            className="ml-auto h-8 w-20 text-right"
            aria-label={`${s.role} start year`}
          />
        ) : (
          s.startYear
        )}
      </TableCell>
      {canEdit && (
        <TableCell>
          {editing ? (
            <Button size="icon" className="h-8 w-8" onClick={save} disabled={pending}>
              <Check className="h-4 w-4" />
              <span className="sr-only">Save</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="sr-only">Edit {s.role}</span>
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  )
}
