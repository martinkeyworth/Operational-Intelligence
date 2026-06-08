"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { sendTestEmail, type TestEmailResult } from "./actions"

export function TestEmailButton() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<TestEmailResult | null>(null)

  return (
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
