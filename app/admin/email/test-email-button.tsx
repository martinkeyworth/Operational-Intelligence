"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendTestEmail, sendTestEmailTo, type TestEmailResult } from "./actions"

export function TestEmailButton() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<TestEmailResult | null>(null)
  const [address, setAddress] = useState("")

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button
          onClick={() =>
            start(async () => {
              setResult(null)
              const r = await sendTestEmail()
              setResult(r)
            })
          }
          disabled={pending}
        >
          {pending ? "Sending..." : "Send test email to me"}
        </Button>
      </div>

      <div className="space-y-3 border-t pt-6">
        <div>
          <p className="text-sm font-medium">Send a test to someone else</p>
          <p className="text-sm text-muted-foreground">
            Confirm delivery to a team member (e.g. Cosmin) now that the sending domain is verified.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="name@example.com"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="sm:max-w-xs"
          />
          <Button
            variant="secondary"
            disabled={pending || !address.trim()}
            onClick={() =>
              start(async () => {
                setResult(null)
                const r = await sendTestEmailTo(address)
                setResult(r)
              })
            }
          >
            {pending ? "Sending..." : "Send test"}
          </Button>
        </div>
      </div>

      {result && (
        <div
          role="status"
          className={
            "rounded-md border p-3 text-sm " +
            (result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800")
          }
        >
          {result.ok ? (
            <p>
              Sent to <strong>{result.to}</strong>. Check that inbox (and spam).
            </p>
          ) : (
            <p>
              Failed: <span className="font-mono">{result.error}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
          disabled={pending}
        >
          {pending ? "Sending..." : "Send test email to me"}
        </Button>

        {result && (
          <div
            role="status"
            className={
              "rounded-md border p-3 text-sm " +
              (result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800")
            }
          >
            {result.ok ? (
              <p>
                Sent to <strong>{result.to}</strong>. Check that inbox (and
                spam).
              </p>
            ) : (
              <p>
                Failed: <span className="font-mono">{result.error}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">Send a test to someone else</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm delivery to a team member (e.g. Cosmin) now that the sending
            domain is verified.
          </p>
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            startTo(async () => {
              setToResult(null)
              const r = await sendTestEmailTo(address)
              setToResult(r)
            })
          }}
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="sm:max-w-xs"
            aria-label="Recipient email address"
          />
          <Button type="submit" variant="secondary" disabled={toPending || !address.trim()}>
            {toPending ? "Sending..." : "Send test"}
          </Button>
        </form>

        {toResult && (
          <div
            role="status"
            className={
              "rounded-md border p-3 text-sm " +
              (toResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800")
            }
          >
            {toResult.ok ? (
              <p>
                Sent to <strong>{toResult.to}</strong>. Ask them to check their
                inbox (and spam).
              </p>
            ) : (
              <p>
                Failed: <span className="font-mono">{toResult.error}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
