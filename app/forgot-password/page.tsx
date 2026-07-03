"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus("sending")
    setError(null)
    // better-auth 1.6.14 client method is requestPasswordReset (not forgetPassword).
    const { error: err } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) {
      setStatus("error")
      setError(err.message || "Something went wrong. Please try again.")
      return
    }
    setStatus("sent")
  }

  return (
    <main className="min-h-svh bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground font-mono text-sm font-bold tracking-tight">
            LTZ
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">LTZ Group</p>
            <p className="text-xs text-muted-foreground">Operational Intelligence</p>
          </div>
        </div>
        <Card className="w-full p-6">
          {status === "sent" ? (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Check your email</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  If an account exists for <span className="font-medium text-foreground">{email}</span>,
                  we&apos;ve sent a link to reset your password. It expires in 1 hour.
                </p>
              </div>
              <Link
                href="/sign-in"
                className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Forgotten your password?
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Enter your email and we&apos;ll send you a link to reset it.
                </p>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-foreground">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                />
              </label>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={status === "sending"} className="w-full">
                {status === "sending" ? "Sending…" : "Send reset link"}
              </Button>
              <Link
                href="/sign-in"
                className="text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </Card>
      </div>
    </main>
  )
}
