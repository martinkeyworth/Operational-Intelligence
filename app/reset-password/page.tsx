"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

function ResetPasswordInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token")
  const errorParam = params.get("error")

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  // No/invalid token — Better Auth appends ?error=INVALID_TOKEN on bad links.
  if (!token || errorParam) {
    return (
      <Card className="w-full p-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Link invalid or expired</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This password reset link is invalid or has expired. Please request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Request a new link
        </Link>
      </Card>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    setStatus("saving")
    setError(null)
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! })
    if (err) {
      setStatus("error")
      setError(err.message || "Could not reset password. The link may have expired.")
      return
    }
    setStatus("done")
    setTimeout(() => router.push("/sign-in"), 1500)
  }

  if (status === "done") {
    return (
      <Card className="w-full p-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Password updated</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your password has been reset. Redirecting you to sign in…
        </p>
      </Card>
    )
  }

  return (
    <Card className="w-full p-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Set a new password</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose a new password for your account.
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">New password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Confirm password</span>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={status === "saving"} className="w-full">
          {status === "saving" ? "Saving…" : "Reset password"}
        </Button>
        <Link href="/sign-in" className="text-center text-sm text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
      </form>
    </Card>
  )
}

export default function ResetPasswordPage() {
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
        <Suspense fallback={<Card className="w-full p-6"><p className="text-sm text-muted-foreground">Loading…</p></Card>}>
          <ResetPasswordInner />
        </Suspense>
      </div>
    </main>
  )
}
