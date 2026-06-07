"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { requireAdmin, serializeLeadAreas } from "@/lib/access"
import { AREA_KEYS } from "@/lib/access-types"

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
