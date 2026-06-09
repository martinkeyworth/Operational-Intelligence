"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Eye } from "lucide-react"

type Option = { id: number; name: string; role: string; siteName: string }

/** Read-only preview banner + barber picker shown when a leadership/dashboard
 *  user opens the Team Area. Switching updates the `as` query param so they can
 *  inspect any team member's self-service view. */
export function TeamPreviewSwitcher({
  options,
  current,
}: {
  options: Option[]
  current: number
}) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString())
    next.set("as", e.target.value)
    router.push(`/team?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <Eye className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Leadership preview — read only
          </p>
          <p className="text-xs text-muted-foreground">
            You&apos;re viewing a team member&apos;s self-service Team Area. Actions are
            disabled here; manage people from Admin &rarr; Team Area.
          </p>
        </div>
      </div>
      <div className="sm:w-64">
        <label htmlFor="preview-as" className="sr-only">
          Preview team member
        </label>
        <select
          id="preview-as"
          value={current}
          onChange={onChange}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.role} · {o.siteName}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
