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
  createCourseAction,
  toggleCourseActiveAction,
  setCourseRoleReqAction,
  removeCourseRoleReqAction,
  addRoleGateAction,
  removeRoleGateAction,
} from "@/app/learning/actions"
import { cn } from "@/lib/utils"
import { Plus, X } from "lucide-react"

type RoleOption = { key: string; title: string }
type CourseWithReqs = {
  id: number
  title: string
  provider: string | null
  category: string | null
  delivery: string | null
  active: boolean
  reqs: { role: string; requirement: string }[]
}
type Group = { category: string; courses: CourseWithReqs[] }
type Gate = { id: number; role: string; requirement: string }

export function CatalogueManager({
  groups,
  roles,
  gates,
}: {
  groups: Group[]
  roles: RoleOption[]
  gates: Gate[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const roleTitle = (key: string) => roles.find((r) => r.key === key)?.title ?? key

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Courses, their role prerequisites, and free-text gates per role.
        </p>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
          <Plus className="size-4" /> Add course
        </Button>
      </div>

      {showAdd ? (
        <form
          action={createCourseAction}
          className="grid gap-2 rounded-lg border border-border bg-card p-4 sm:grid-cols-2"
        >
          <input name="title" required placeholder="Course title" className="input" />
          <input name="provider" placeholder="Provider" className="input" />
          <input name="category" placeholder="Category (e.g. Barbering)" className="input" />
          <input name="delivery" placeholder="Delivery (e.g. In-person)" className="input" />
          <input name="durationNote" placeholder="Duration note" className="input sm:col-span-2" />
          <textarea name="description" placeholder="Description" rows={2} className="input sm:col-span-2" />
          <div className="sm:col-span-2">
            <Button type="submit" size="sm">
              Create course
            </Button>
          </div>
        </form>
      ) : null}

      {groups.map((g) => (
        <section key={g.category} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {g.category}
          </h3>
          <ul className="space-y-2">
            {g.courses.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn("text-sm font-medium", c.active ? "text-foreground" : "text-muted-foreground line-through")}>
                      {c.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[c.provider, c.delivery].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <form action={toggleCourseActiveAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="active" value={(!c.active).toString()} />
                    <Button type="submit" size="sm" variant="ghost">
                      {c.active ? "Archive" : "Restore"}
                    </Button>
                  </form>
                </div>

                {/* Role requirements */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {c.reqs.map((r) => (
                    <span
                      key={`${c.id}-${r.role}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-foreground"
                    >
                      {roleTitle(r.role)}
                      <span className="text-muted-foreground">({r.requirement})</span>
                      <form action={removeCourseRoleReqAction} className="inline">
                        <input type="hidden" name="courseId" value={c.id} />
                        <input type="hidden" name="role" value={r.role} />
                        <button type="submit" aria-label="Remove" className="text-muted-foreground hover:text-destructive">
                          <X className="size-3" />
                        </button>
                      </form>
                    </span>
                  ))}
                  <AddReqInline courseId={c.id} roles={roles} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Role gates */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Role gates</h3>
        <ul className="space-y-1.5">
          {gates.map((g) => (
            <li key={g.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span className="text-foreground">
                <span className="font-medium">{roleTitle(g.role)}:</span> {g.requirement}
              </span>
              <form action={removeRoleGateAction}>
                <input type="hidden" name="id" value={g.id} />
                <Button type="submit" size="sm" variant="ghost">
                  <X className="size-4" />
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <AddGate roles={roles} />
      </section>

      <style>{`.input{width:100%;border-radius:0.5rem;border:1px solid var(--input);background:transparent;padding:0.5rem 0.75rem;font-size:0.875rem}`}</style>
    </div>
  )
}

function AddReqInline({ courseId, roles }: { courseId: number; roles: RoleOption[] }) {
  const [role, setRole] = useState("")
  const [req, setReq] = useState("required")
  return (
    <form action={setCourseRoleReqAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="requirement" value={req} />
      <Select value={role || null} onValueChange={(v) => setRole(v ?? "")}>
        <SelectTrigger size="sm">
          <SelectValue placeholder="+ role" />
        </SelectTrigger>
        <SelectContent>
          {roles.map((r) => (
            <SelectItem key={r.key} value={r.key}>
              {r.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={req} onValueChange={(v) => setReq(v ?? "required")}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="required">required</SelectItem>
          <SelectItem value="recommended">recommended</SelectItem>
        </SelectContent>
      </Select>
      {role ? (
        <Button type="submit" size="sm" variant="outline">
          Add
        </Button>
      ) : null}
    </form>
  )
}

function AddGate({ roles }: { roles: RoleOption[] }) {
  const [role, setRole] = useState("")
  return (
    <form action={addRoleGateAction} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
      <input type="hidden" name="role" value={role} />
      <Select value={role || null} onValueChange={(v) => setRole(v ?? "")}>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          {roles.map((r) => (
            <SelectItem key={r.key} value={r.key}>
              {r.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input
        name="requirement"
        placeholder="Gate requirement (e.g. 12 months in role)"
        className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
      />
      <Button type="submit" size="sm">
        Add gate
      </Button>
    </form>
  )
}
