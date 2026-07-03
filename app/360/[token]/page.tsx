import { getReviewerContext } from "@/lib/three-sixty"
import { ReviewerForm } from "@/components/three-sixty/reviewer-form"
import { formatPeriod } from "@/lib/learning-types"

export const metadata = {
  title: "360 Feedback | LTZ",
  description: "Share your feedback to support a colleague's development review.",
}

export default async function ReviewerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await getReviewerContext(token)

  return (
    <main className="min-h-dvh bg-background px-4 py-8 flex justify-center">
      <div className="w-full max-w-xl">
        <header className="mb-6">
          <p className="text-sm font-medium text-muted-foreground">LTZ 360 Feedback</p>
          <h1 className="text-2xl font-semibold text-balance mt-1">
            {ctx ? `Feedback for ${ctx.barberName}` : "360 Feedback"}
          </h1>
          {ctx ? (
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              {ctx.reviewerName}, thanks for taking a couple of minutes. Your input for the{" "}
              <strong>{formatPeriod(ctx.period)}</strong> review is confidential and helps shape{" "}
              {ctx.barberName}&apos;s development.
            </p>
          ) : null}
        </header>

        {!ctx ? (
          <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <p className="text-sm leading-relaxed">
              This feedback link is not valid or has expired. If you believe this is a mistake, please ask
              the person who invited you to resend it.
            </p>
          </div>
        ) : ctx.alreadyResponded ? (
          <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <p className="text-sm leading-relaxed">
              You have already submitted your feedback for {ctx.barberName}. Thank you — there is nothing
              more to do.
            </p>
          </div>
        ) : ctx.cycleStatus !== "Open" ? (
          <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <p className="text-sm leading-relaxed">
              This 360 review has now closed. Thank you for your interest.
            </p>
          </div>
        ) : (
          <ReviewerForm token={token} barberName={ctx.barberName} />
        )}
      </div>
    </main>
  )
}
