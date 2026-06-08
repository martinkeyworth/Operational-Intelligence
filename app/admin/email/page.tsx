import { requireOwner } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { TestEmailButton } from "./test-email-button"

export default async function EmailDiagnosticsPage() {
  const owner = await requireOwner()

  return (
    <AppShell user={owner}>
      <PageHeader
        meta="Admin"
        title="Email diagnostics"
        subtitle="Send yourself a test email to confirm delivery is working from the live site."
      />

      <div className="space-y-6 px-5 py-6 md:px-8">
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This sends a test message to your own address ({owner.email}) using
            the live email configuration. If it arrives, weekly and daily
            notifications will send correctly too.
          </p>
          <TestEmailButton />
        </section>
      </div>
    </AppShell>
  )
}
