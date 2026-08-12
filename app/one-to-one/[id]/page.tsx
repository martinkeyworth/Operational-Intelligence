import { redirect } from "next/navigation"
import { requireUser } from "@/lib/access"
import { getOneToOneReviewForManager } from "@/lib/team"
import { OneToOneReview } from "@/components/one-to-one-review"

export const dynamic = "force-dynamic"

/**
 * Manager-scoped 1-2-1 completion page, reached from the "Complete this 1-2-1"
 * link in the scheduling email. Shows ONLY the given barber's 1-2-1s, and only
 * to that barber's assigned manager (or a team admin) — everyone else is sent
 * to /no-access. No other personal data is exposed here (GDPR).
 */
export default async function OneToOnePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const barberId = Number(id)
  if (!Number.isFinite(barberId) || barberId <= 0) redirect("/no-access")

  const user = await requireUser()
  const isTeamAdmin = Boolean(user.isCompany && user.canViewDashboard)
  const review = await getOneToOneReviewForManager(barberId, { id: user.id, isTeamAdmin })
  if (!review) redirect("/no-access")

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <OneToOneReview review={review} />
    </main>
  )
}
