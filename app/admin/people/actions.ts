"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { user as userTable, barbers } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { requireAdmin, serializeLeadAreas } from "@/lib/access"
import { AREA_KEYS, isOwnerEmail } from "@/lib/access-types"

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

/**
 * Admin-only: suspend or restore an account. Suspending blocks all access
 * (enforced in getAccessUser), revokes any live sessions immediately, and marks
 * the person's barber record inactive so they drop off weekly rosters, chases,
 * holiday and 1-2-1s. Restoring reverses all three. Owners cannot be suspended.
 */
export async function setUserSuspended(formData: FormData) {
  const admin = await requireAdmin()

  const userId = String(formData.get("userId") ?? "")
  const suspend = String(formData.get("suspend")) === "true"
  if (!userId) throw new Error("Missing user")

  const [target] = await db
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
  if (!target) throw new Error("User not found")
  if (isOwnerEmail(target.email)) throw new Error("Owners cannot be suspended.")

  await db
    .update(userTable)
    .set({ suspendedAt: suspend ? new Date() : null, updatedAt: new Date() })
    .where(eq(userTable.id, userId))

  // Mirror on the barber record so a suspended person is no longer chased or
  // counted; restoring reactivates it.
  await db
    .update(barbers)
    .set({ active: !suspend })
    .where(eq(barbers.userId, userId))

  if (suspend) {
    // Kill any live sessions so the block takes effect immediately, not just on
    // next login.
    const ctx = await auth.$context
    await ctx.internalAdapter.deleteUserSessions(userId)
  }

  console.log(
    `[v0] Admin ${admin.email} ${suspend ? "suspended" : "restored"} user ${userId}`,
  )

  // Access + rosters change app-wide, so refresh the whole tree.
  revalidatePath("/", "layout")
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

  // Capability flags drive the nav, route access and which areas a user sees,
  // so revalidate the whole tree to keep every surface consistent.
  revalidatePath("/", "layout")
}
