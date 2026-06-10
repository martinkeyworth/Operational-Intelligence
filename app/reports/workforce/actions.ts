"use server"

import { requireDashboard } from "@/lib/access"
import { db } from "@/lib/db"
import { openingRoleOverrides } from "@/lib/db/schema"
import { OPENING_SCHEDULE } from "@/lib/plan"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type SaveOpeningRolesResult =
  | { ok: true }
  | { ok: false; error: string }

const clamp = (n: number) => Math.max(0, Math.min(99, Math.round(n)))

/**
 * Save (upsert) editable headcount for one planned opening. Dashboard users
 * only. The opening is identified by its schedule key (location+year+month);
 * we validate it exists in OPENING_SCHEDULE so arbitrary rows can't be written.
 */
export async function saveOpeningRoles(input: {
  location: string
  year: number
  month: number
  managerCount: number
  barberCount: number
  apprenticeCount: number
}): Promise<SaveOpeningRolesResult> {
  const user = await requireDashboard()

  const exists = OPENING_SCHEDULE.some(
    (op) =>
      op.location === input.location &&
      op.year === input.year &&
      op.month === input.month,
  )
  if (!exists) return { ok: false, error: "Unknown opening." }

  const managerCount = clamp(input.managerCount)
  const barberCount = clamp(input.barberCount)
  const apprenticeCount = clamp(input.apprenticeCount)

  try {
    await db
      .insert(openingRoleOverrides)
      .values({
        location: input.location,
        targetYear: input.year,
        targetMonth: input.month,
        managerCount,
        barberCount,
        apprenticeCount,
        updatedBy: user.email ?? user.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          openingRoleOverrides.location,
          openingRoleOverrides.targetYear,
          openingRoleOverrides.targetMonth,
        ],
        set: {
          managerCount,
          barberCount,
          apprenticeCount,
          updatedBy: user.email ?? user.id,
          updatedAt: new Date(),
        },
      })
    revalidatePath("/reports/workforce")
    return { ok: true }
  } catch (err) {
    console.error("[v0] saveOpeningRoles failed:", err)
    return { ok: false, error: "Could not save. Please try again." }
  }
}

/** Reset an opening back to the plan's default headcount (deletes the override). */
export async function resetOpeningRoles(input: {
  location: string
  year: number
  month: number
}): Promise<SaveOpeningRolesResult> {
  await requireDashboard()
  try {
    await db
      .delete(openingRoleOverrides)
      .where(
        and(
          eq(openingRoleOverrides.location, input.location),
          eq(openingRoleOverrides.targetYear, input.year),
          eq(openingRoleOverrides.targetMonth, input.month),
        ),
      )
    revalidatePath("/reports/workforce")
    return { ok: true }
  } catch (err) {
    console.error("[v0] resetOpeningRoles failed:", err)
    return { ok: false, error: "Could not reset. Please try again." }
  }
}
