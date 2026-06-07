import Link from "next/link"
import { Card } from "@/components/ui/card"

export default function ForgotPasswordPage() {
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
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Forgotten your password?
              </h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Password resets are handled by an administrator — there&apos;s
                no email step. Message Martin or Cosmin and they&apos;ll set a
                new password for you straight away from the People &amp; Access
                page. You can change it yourself once you&apos;re signed in.
              </p>
            </div>
            <Link
              href="/sign-in"
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Back to sign in
            </Link>
          </div>
        </Card>
      </div>
    </main>
  )
}
