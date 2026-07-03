"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  savePlanMetaAction,
  addPlanItemAction,
  updatePlanItemAction,
  deletePlanItemAction,
} from "@/app/learning/actions"
import {
  PLAN_ITEM_STATUSES,
  PLAN_ITEM_STATUS_LABELS,
  type PlanItemStatus,
} from "@/lib/learning-types"
import { cn } from "@/lib/utils"
import { CheckCircle2, Circle, CircleDashed, Trash2 } from "lucide-react"

type RoleOption = { key: string; title: string }
type CourseOption = { id: number; title: string }
type PlanItem = {
  id: number
  courseId: number | null
  courseTitle: string | null
  title: string | null
  status: string
  targetDate: string | null
  notes: string | null
}
type RequiredCourse = { course: { id: number; title: string }; met: boolean }

export type PlanEditorData = {
  barberId: number
  targetRole: string | null
  aspiration: string | null
  items: PlanItem[]
  requiredCourses: RequiredCourse[]
  recommendedCourses: { id: number; title: string }[]
  gates: { id: number; requirement: string }[]
  targetRoleTitle: string
  progressPct: number
}

/** Manager/lead plan editor for a single barber. Uses form-bound server actions. */
export function PlanEditor({
  data,
  roles,
  courses,
}: {
  data: PlanEditorData
  roles: RoleOption[]
  courses: CourseOption[]
}) {
  const [targetRole, setTargetRole] = useState(data.targetRole ?? "")

  return (
    <div className="space-y-6">
      {/* Target role + aspiration */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Target role &amp; aspiration</h3>
        <form action={savePlanMetaAction} className="mt-3 space-y-3">
          <input type="hidden" name="barberId" value={data.barberId} />
          <input type="hidden" name="targetRole" value={targetRole} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Next role</span>
              <Select value={targetRole || null} onValueChange={(v) => setTargetRole(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select target role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Aspiration</span>
              <input
                name="aspiration"
                defaultValue={data.aspiration ?? ""}
                placeholder="e.g. Master Barber within 18 months"
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              />
            </label>
          </div>
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </section>

      {/* Progression tracker */}
      {data.targetRole ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Requirements for {data.targetRoleTitle}
            </h3>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {data.progressPct}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${data.progressPct}%` }} />
          </div>
          <ul className="mt-3 space-y-1.5">
            {data.requiredCourses.map((rc) => (
              <li key={rc.course.id} className="flex items-center gap-2 text-sm">
                {rc.met ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={cn(rc.met ? "text-foreground" : "text-muted-foreground")}>
                  {rc.course.title}
                </span>
                <span className="text-xs text-muted-foreground">required</span>
              </li>
            ))}
            {data.recommendedCourses.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <CircleDashed className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">{c.title}</span>
                <span className="text-xs text-muted-foreground">recommended</span>
              </li>
            ))}
            {data.gates.map((g) => (
              <li key={`gate-${g.id}`} className="flex items-center gap-2 text-sm">
                <CircleDashed className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">{g.requirement}</span>
                <span className="text-xs text-muted-foreground">gate</span>
              </li>
            ))}
            {data.requiredCourses.length === 0 &&
            data.recommendedCourses.length === 0 &&
            data.gates.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                No prerequisites configured for this role yet.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {/* Plan items */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Development actions</h3>
        <ul className="mt-3 space-y-2">
          {data.items.length === 0 ? (
            <li className="text-sm text-muted-foreground">No actions yet — add the first below.</li>
          ) : null}
          {data.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {item.courseTitle ?? item.title ?? "Untitled action"}
                  </p>
                  {item.targetDate ? (
                    <p className="text-xs text-muted-foreground">Target: {item.targetDate}</p>
                  ) : null}
                  {item.notes ? <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p> : null}
                </div>
                <form action={deletePlanItemAction}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="barberId" value={data.barberId} />
                  <Button type="submit" size="sm" variant="ghost" aria-label="Delete action">
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              </div>
              <form action={updatePlanItemAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="barberId" value={data.barberId} />
                <StatusSelect name="status" defaultValue={item.status as PlanItemStatus} />
                <Button type="submit" size="sm" variant="outline">
                  Update
                </Button>
              </form>
            </li>
          ))}
        </ul>

        {/* Add item */}
        <form action={addPlanItemAction} className="mt-4 space-y-2 border-t border-border pt-4">
          <input type="hidden" name="barberId" value={data.barberId} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Course (optional)</span>
              <CourseSelect courses={courses} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Or custom action</span>
              <input
                name="title"
                placeholder="e.g. Shadow senior barber"
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Target date</span>
              <input
                name="targetDate"
                type="date"
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Notes</span>
              <input
                name="notes"
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              />
            </label>
          </div>
          <Button type="submit" size="sm">
            Add action
          </Button>
        </form>
      </section>
    </div>
  )
}

function StatusSelect({ name, defaultValue }: { name: string; defaultValue: PlanItemStatus }) {
  const [value, setValue] = useState<PlanItemStatus>(defaultValue)
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={(v) => setValue((v as PlanItemStatus) ?? "planned")}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAN_ITEM_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {PLAN_ITEM_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

function CourseSelect({ courses }: { courses: CourseOption[] }) {
  const [value, setValue] = useState<string>("")
  return (
    <>
      <input type="hidden" name="courseId" value={value} />
      <Select value={value || null} onValueChange={(v) => setValue(v ?? "")}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a course" />
        </SelectTrigger>
        <SelectContent>
          {courses.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
