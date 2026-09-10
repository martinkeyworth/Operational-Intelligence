"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Ban, ShieldCheck } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { CAPABILITY_LABELS, AREA_KEYS, type AccessUser } from "@/lib/access-types"
import { FUNCTION_AREAS } from "@/lib/function-areas"
import {
  updateUserCapabilities,
  setUserSuspended,
} from "@/app/admin/people/actions"
import { SetPasswordForm } from "@/components/set-password-form"

const AREA_LABELS: Record<string, string> = Object.fromEntries(
  FUNCTION_AREAS.map((a) => [a.key, a.label]),
)

export function UserAccessCard({ user }: { user: AccessUser }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [suspending, setSuspending] = useState(false)

  async function suspendAction(formData: FormData) {
    setSuspending(true)
    try {
      await setUserSuspended(formData)
      router.refresh()
    } finally {
      setSuspending(false)
    }
  }

  async function action(formData: FormData) {
    setPending(true)
    setSaved(false)
    try {
      await updateUserCapabilities(formData)
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setPending(false)
    }
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <Card className="p-4 md:p-5">
      <form action={action}>
        <input type="hidden" name="userId" value={user.id} />

        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="truncate">{user.name}</span>
              {user.suspended && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  <Ban className="h-3 w-3" />
                  Suspended
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
              {user.isCompany ? " · Company" : " · External"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CAPABILITY_LABELS.map((cap) => {
            const checked = user[cap.key]
            return (
              <Label
                key={cap.key}
                htmlFor={`${cap.key}-${user.id}`}
                className="flex items-start gap-2.5 rounded-md border border-border p-2.5 text-sm"
              >
                <Checkbox
                  id={`${cap.key}-${user.id}`}
                  name={cap.key}
                  defaultChecked={checked}
                  className="mt-0.5"
                />
                <span className="leading-tight">
                  <span className="font-medium text-foreground">{cap.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {cap.description}
                  </span>
                </span>
              </Label>
            )
          })}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-foreground">
            Functional area leads
          </p>
          <p className="mb-2.5 text-xs text-muted-foreground">
            Areas this person leads — they can raise and manage that area&apos;s
            risks, issues and actions.
          </p>
          <div className="flex flex-wrap gap-2">
            {AREA_KEYS.map((key) => {
              const checked = user.leadAreas.includes(key)
              return (
                <Label
                  key={key}
                  htmlFor={`area-${key}-${user.id}`}
                  className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                >
                  <Checkbox
                    id={`area-${key}-${user.id}`}
                    name={`area:${key}`}
                    defaultChecked={checked}
                  />
                  <span className="font-medium text-foreground">{AREA_LABELS[key] ?? key}</span>
                </Label>
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" size="sm" disabled={pending} className="h-9 gap-1.5">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {pending ? "Saving…" : saved ? "Saved" : "Save access"}
          </Button>
        </div>
      </form>

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-2 text-xs font-semibold text-foreground">
          Password
        </p>
        <p className="mb-2.5 text-xs text-muted-foreground">
          Set a new password for this person and share it with them directly —
          no email needed.
        </p>
        <SetPasswordForm userId={user.id} userName={user.name} />
      </div>

      {!user.isOwner && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold text-foreground">Access</p>
          <p className="mb-2.5 text-xs text-muted-foreground">
            {user.suspended
              ? "This person is blocked from signing in and using the app, and is off all rosters and chases."
              : "Suspend to immediately block this person from signing in and drop them off rosters, chases, holiday and 1-2-1s. Reversible."}
          </p>
          <form action={suspendAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input
              type="hidden"
              name="suspend"
              value={user.suspended ? "false" : "true"}
            />
            <Button
              type="submit"
              size="sm"
              variant={user.suspended ? "outline" : "destructive"}
              disabled={suspending}
              className="h-9 w-full gap-1.5 sm:w-auto"
            >
              {suspending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : user.suspended ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              {user.suspended ? "Restore access" : "Suspend access"}
            </Button>
          </form>
        </div>
      )}
    </Card>
  )
}
