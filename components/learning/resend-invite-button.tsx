"use client"

import { useState, useTransition } from "react"
import { resendOneToOneInviteAction } from "@/app/learning/actions"

/** Small inline "Resend link" control for a Scheduled 1-2-1 on the roster. */
export function ResendInviteButton({ barberId }: { barberId: number }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function onClick() {
    setMsg(null)
    start(async () => {
      const res = await resendOneToOneInviteAction(barberId)
      if (res.ok) {
        setMsg(res.sent ? `Sent (${res.sent})` : "Sent")
      } else {
        setMsg(res.error ?? "Failed")
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        {pending ? "Sending…" : "Resend link"}
      </button>
      {msg ? <span className="text-[11px] text-muted-foreground">{msg}</span> : null}
    </span>
  )
}
