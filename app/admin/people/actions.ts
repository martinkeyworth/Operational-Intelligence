"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/access"

export async function updateUserCapabilities(formData: FormData) {
  await requireAdmin()

  const userId = String(formData.get("userId") ?? "")
  if (!userId) throw new Error("Missing user")

  // Checkbox fields submit "on" when ticked, absent when not.
  await db
    .update(userTable)
    .set({
      canViewDashboard: formData.get("canViewDashboard") === "on",
      isBarber: formData.get("isBarber") === "on",
      isTrainingLead: formData.get("isTrainingLead") === "on",
      isHrLead: formData.get("isHrLead") === "on",
      isSocialMedia: formData.get("isSocialMedia") === "on",
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, userId))

  revalidatePath("/admin/people")
}
