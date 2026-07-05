import { redirect } from "next/navigation"
import { requireUser, defaultLandingFor } from "@/lib/access"

/**
 * Post-sign-in entry point. Resolves the signed-in user and forwards them to
 * their role-based default landing page. Kept separate from "/" (Group Overview)
 * so navigating to the overview never bounces users in a redirect loop.
 */
export default async function StartPage() {
  const user = await requireUser()
  redirect(defaultLandingFor(user))
}
