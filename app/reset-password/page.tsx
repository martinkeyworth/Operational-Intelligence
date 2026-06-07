"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"

function ResetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const urlError = searchParams.get("error")

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Surface an invalid/expired link straight away.
  useEffect(() => {
    if (urlError) {
      setError("This reset link is invalid or has expired. Request a new one.")
    }
  }, [urlError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError("Missing reset token. Please use the link from your email.")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setLoading(true)
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    })
    setLoading(false)

    if (error) {
      setError(error.message ?? "Something went wrong")
      return
    }
    setDone(true)
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
          {done ? (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Password updated
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Your password has been reset. You can now sign in with your
                  new password.
                </p>
              </div>
              <Button className="w-full" onClick={() => router.push("/sign-in")}>
                Go to sign in
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Choose a new password
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter a new password for your account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    disabled={!token}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    disabled={!token}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full"
                >
                  {loading ? "Updating..." : "Update password"}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground text-center mt-6">
                <Link
                  href="/forgot-password"
                  className="text-foreground font-medium underline-offset-4 hover:underline"
                >
                  Request a new link
                </Link>
              </p>
            </>
          )}
        </Card>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}
