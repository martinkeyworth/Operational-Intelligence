"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { requireAdmin, serializeLeadAreas } from "@/lib/access"
import { AREA_KEYS } from "@/lib/access-types"

export type SetPasswordResult = { ok: boolean; error?: string }

/**
 * Admin-only: set a user's password immediately (no email, no reset link).
 * Hashes the new password with Better Auth's own hasher and writes it to the
 * user's credential account — creating one if the user has never had a
 * password. All existing sessions for that user are revoked so the old
 * password can't keep a session alive.
 */
export async function setUserPassword(
  formData: FormData,
): Promise<SetPasswordResult> {
  const admin = await requireAdmin()

  const userId = String(formData.get("userId") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")

  if (!userId) return { ok: false, error: "Missing user." }
  if (newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." }
  }

  // Confirm the target user exists.
  const [target] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, userId))
  if (!target) return { ok: false, error: "User not found." }

  const ctx = await auth.$context
  const hashed = await ctx.password.hash(newPassword)

  const accounts = await ctx.internalAdapter.findAccounts(userId)
  const credential = accounts.find((a) => a.providerId === "credential")

  if (credential) {
    await ctx.internalAdapter.updatePassword(userId, hashed)
  } else {
    // User signed up via a path that never created a credential account.
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hashed,
    })
  }

  // Invalidate any active sessions so a previously known password / live
  // session can't continue after the reset.
  await ctx.internalAdapter.deleteUserSessions(userId)

  console.log(
    `[v0] Admin ${admin.email} set a new password for user ${userId}`,
  )

  revalidatePath("/admin/people")
  return { ok: true }
}

export async function updateUserCapabilities(formData: FormData) {
  await requireAdmin()

  const userId = String(formData.get("userId") ?? "")
  if (!userId) throw new Error("Missing user")

  // Lead-area checkboxes submit name="area:<Key>" = "on" when ticked.
  const leadAreas = serializeLeadAreas(
    AREA_KEYS.filter((key) => formData.get(`area:${key}`) === "on"),
  )

  // Checkbox fields submit "on" when ticked, absent when not.
  await db
    .update(userTable)
    .set({
      canViewDashboard: formData.get("canViewDashboard") === "on",
      isBarber: formData.get("isBarber") === "on",
      isTrainingLead: formData.get("isTrainingLead") === "on",
      isHrLead: formData.get("isHrLead") === "on",
      isSocialMedia: formData.get("isSocialMedia") === "on",
      leadAreas,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, userId))

  revalidatePath("/admin/people")
}
