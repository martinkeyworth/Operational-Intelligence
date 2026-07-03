"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  sendRoleGuidesAction,
  sendRoleGuidePreviewAction,
} from "./actions"
import type { GuideSendResult } from "@/lib/role-guide-email"

export function RoleGuideSender() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<GuideSendResult | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [previewPending, startPreview] = useTransition()
  const [previewMsg, setPreviewMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [address, setAddress] = useState("")

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Send everyone their role guide</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Emails every active team member one personalised message explaining
            the dashboard and exactly what they need to do — combining all of
            their roles into a single guide.
          </p>
        </div>

        {!confirming ? (
          <Button onClick={() => setConfirming(true)} disabled={pending}>
            Send role guides to everyone
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm text-foreground">Send to all active team members now?</span>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  start(async () => {
                    setResult(null)
                    setConfirming(false)
                    const r = await sendRoleGuidesAction()
                    setResult(r)
                  })
                }
                disabled={pending}
              >
                {pending ? "Sending..." : "Yes, send to everyone"}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div
            role="status"
            className={
              "rounded-md border p-3 text-sm " +
              (result.failed === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900")
            }
          >
            <p className="font-medium">
              Sent {result.sent} guide{result.sent === 1 ? "" : "s"}
              {result.failed > 0 ? `, ${result.failed} failed` : ""}.
            </p>
            <ul className="mt-2 space-y-0.5 text-xs">
              {result.results.map((r) => (
                <li key={r.email}>
                  {r.ok ? "✓" : "✗"} {r.name} — {r.email}
                  {r.error ? ` (${r.error})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">Preview a guide first</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a single guide to any address to check it before the group send.
            Use a team member&apos;s email to see their exact guide.
          </p>
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            startPreview(async () => {
              setPreviewMsg(null)
              const r = await sendRoleGuidePreviewAction(address)
              setPreviewMsg({
                ok: r.ok,
                text: r.ok ? `Preview sent to ${r.to}.` : r.error || "Failed to send.",
              })
            })
          }}
        >
          <Input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="email"
            placeholder="name@example.com"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="sm:max-w-xs"
            aria-label="Preview recipient email address"
          />
          <Button type="submit" variant="secondary" disabled={previewPending || !address.trim()}>
            {previewPending ? "Sending..." : "Send preview"}
          </Button>
        </form>

        {previewMsg && (
          <p
            role="status"
            className={
              "rounded-md border p-3 text-sm " +
              (previewMsg.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800")
            }
          >
            {previewMsg.text}
          </p>
        )}
      </div>
    </div>
  )
}
