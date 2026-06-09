import { requireOwner } from "@/lib/access"
import { PageHeader } from "@/components/ui-bits"
import { TestEmailButton } from "./test-email-button"
import { resolvedFrom } from "@/lib/email"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function EmailDiagnosticsPage() {
  const owner = await requireOwner()
  const from = resolvedFrom()
  const usingVerifiedDomain = !from.includes("resend.dev")

  return (
    <>
      <PageHeader
        meta="Admin"
        title="Email diagnostics"
        subtitle="Send yourself a test email to confirm delivery is working from the live site."
      />

      <div className="space-y-6 px-5 py-6 md:px-8">
        <section
          className={
            "rounded-md border p-4 text-sm " +
            (usingVerifiedDomain
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900")
          }
        >
          <p className="font-medium">Live sender address</p>
          <p className="mt-1 font-mono break-all">{from}</p>
          <p className="mt-2">
            {usingVerifiedDomain
              ? "Using a verified domain — emails can be sent to anyone."
              : "Falling back to Resend's shared sender — emails can only reach the Resend account owner. Set EMAIL_FROM to an address on your verified domain and redeploy."}
          </p>
        </section>

        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This sends a test message to your own address ({owner.email}) using
            the live email configuration. If it arrives, weekly and daily
            notifications will send correctly too.
          </p>
          <TestEmailButton />
        </section>
      </div>
    </>
  )
}
