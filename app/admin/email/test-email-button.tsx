"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendTestEmail, sendTestEmailTo, type TestEmailResult } from "./actions"

function ResultBanner({ result, otherLabel }: { result: TestEmailResult; otherLabel?: boolean }) {
  return (
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
          Sent to <strong>{result.to}</strong>.{" "}
          {otherLabel ? "Ask them to check their inbox (and spam)." : "Check that inbox (and spam)."}
        </p>
      ) : (
        <p>
          Failed: <span className="font-mono">{result.error}</span>
        </p>
      )}
    </div>
  )
}

export function TestEmailButton() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<TestEmailResult | null>(null)

  const [toPending, startTo] = useTransition()
  const [toResult, setToResult] = useState<TestEmailResult | null>(null)
  const [address, setAddress] = useState("")

  return (
    <div className="space-y-8">
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

        {result && <ResultBanner result={result} />}
      </div>

      <div className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">Send a test to someone else</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm delivery to a team member (e.g. Cosmin) now that the sending domain is verified.
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
            autoCapitalize="none"
            autoCorrect="off"
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

        {toResult && <ResultBanner result={toResult} otherLabel />}
      </div>
    </div>
  )
}
