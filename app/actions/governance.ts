"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { updateActionStatus } from "@/lib/data"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user
}

export async function setActionStatus(id: number, status: string) {
  await requireUser()
  await updateActionStatus(id, status)
  revalidatePath("/")
  revalidatePath("/actions")
}
