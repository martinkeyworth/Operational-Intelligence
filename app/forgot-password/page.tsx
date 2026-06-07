"use client"

import { useState } from "react"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    })

    setLoading(false)

    if (error) {
      setError(error.message ?? "Something went wrong")
      return
    }
    // Always show success regardless of whether the email exists, to avoid
    // leaking which addresses have accounts.
    setSent(true)
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
            <p className="text-xs text-muted-foreground">
              Operational Intelligence
            </p>
          </div>
        </div>
        <Card className="w-full p-6">
          {sent ? (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Check your email
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  If an account exists for{" "}
                  <span className="text-foreground">{email}</span>, we&apos;ve
                  sent a link to reset your password. The link expires in 1
                  hour.
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Don&apos;t see it? Check your spam folder, or contact your
                  administrator if it doesn&apos;t arrive shortly.
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
            <>
              <div className="mb-6">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Reset your password
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter your email and we&apos;ll send you a link to set a new
                  password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground text-center mt-6">
                Remembered it?{" "}
                <Link
                  href="/sign-in"
                  className="text-foreground font-medium underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </Card>
      </div>
    </main>
  )
}
