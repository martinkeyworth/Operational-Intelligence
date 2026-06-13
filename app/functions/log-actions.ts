"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { actions, user as userTable } from "@/lib/db/schema"
import { requireAreaLead, requireUser, canInputArea } from "@/lib/access"
import { ENTRY_TYPES, type EntryType } from "@/lib/access-types"
import { findFunctionArea } from "@/lib/function-areas"

// ---------------------------------------------------------------------------
// AREA RAID LOG  —  Risks, Issues, Actions raised + managed by each area lead.
// Every entry rolls up to the dashboard / operations register / continuity
// briefing through the existing aggregation (no extra rollup needed here).
// ---------------------------------------------------------------------------

function revalidateLog(areaKey: string) {
  revalidatePath(`/functions/${encodeURIComponent(areaKey)}`)
  revalidatePath("/functions")
  revalidatePath("/continuity")
  revalidatePath("/")
}

function cleanType(value: unknown): EntryType {
  const t = String(value ?? "Action")
  return (ENTRY_TYPES as readonly string[]).includes(t) ? (t as EntryType) : "Action"
}

function cleanRag(value: unknown): string {
  const r = String(value ?? "amber")
  return ["red", "amber", "green"].includes(r) ? r : "amber"
}

/** Resolve an owner user id -> their name (for the free-text owner mirror). */
async function ownerNameFor(ownerUserId: string | null): Promise<string | null> {
  if (!ownerUserId) return null
  const [u] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, ownerUserId))
  return u?.name ?? null
}

/** Create a new RAID log entry in a functional area. Lead-gated. */
export async function createLogEntry(formData: FormData) {
  const areaKey = String(formData.get("functionArea") ?? "").trim()
  if (!findFunctionArea(areaKey)) throw new Error("Unknown functional area")
  const lead = await requireAreaLead(areaKey)

  const title = String(formData.get("title") ?? "").trim()
  if (!title) throw new Error("Title is required")
  const description = String(formData.get("description") ?? "").trim() || null
  const entryType = cleanType(formData.get("entryType"))
  const rag = cleanRag(formData.get("rag"))
  const priority = String(formData.get("priority") ?? "Medium").trim() || "Medium"
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null
  const siteIdRaw = String(formData.get("siteId") ?? "").trim()
  const siteId = siteIdRaw ? Number(siteIdRaw) : null
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim() || null
  const ownerName = (await ownerNameFor(ownerUserId)) ?? lead.name

  await db.insert(actions).values({
    title,
    description,
    functionArea: areaKey,
    entryType,
    siteId,
    owner: ownerName,
    ownerUserId,
    createdByUserId: lead.id,
    priority,
    status: "Open",
    rag,
    dueDate,
    escalated: false,
    // Risk entries also feed the weekly operational meeting register.
    isRisk: entryType === "Risk",
    updatedAt: new Date(),
  })

  revalidateLog(areaKey)
}

/** Edit an existing RAID entry. Lead of the entry's area (or owner) only. */
export async function editLogEntry(formData: FormData) {
  const id = Number(formData.get("id"))
  if (!id) throw new Error("Missing entry id")

  const [existing] = await db.select().from(actions).where(eq(actions.id, id))
  if (!existing) throw new Error("Entry not found")

  // Authorise against the entry's CURRENT area before allowing changes.
  const user = await requireUser()
  if (!canInputArea(user, existing.functionArea)) {
    throw new Error("Not authorised to manage this area")
  }

  const title = String(formData.get("title") ?? "").trim()
  if (!title) throw new Error("Title is required")
  const description = String(formData.get("description") ?? "").trim() || null
  const entryType = cleanType(formData.get("entryType"))
  const rag = cleanRag(formData.get("rag"))
  const status = String(formData.get("status") ?? existing.status).trim()
  const priority = String(formData.get("priority") ?? "Medium").trim() || "Medium"
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim() || null
  const ownerName = (await ownerNameFor(ownerUserId)) ?? existing.owner

  await db
    .update(actions)
    .set({
      title,
      description,
      entryType,
      rag,
      status,
      priority,
      dueDate,
      ownerUserId,
      owner: ownerName,
      isRisk: entryType === "Risk",
      updatedAt: new Date(),
    })
    .where(eq(actions.id, id))

  revalidateLog(existing.functionArea)
}

/** Close (resolve) a RAID entry. Lead of the entry's area (or owner) only. */
export async function closeLogEntry(formData: FormData) {
  const id = Number(formData.get("id"))
  if (!id) throw new Error("Missing entry id")

  const [existing] = await db.select().from(actions).where(eq(actions.id, id))
  if (!existing) throw new Error("Entry not found")

  const user = await requireUser()
  if (!canInputArea(user, existing.functionArea)) {
    throw new Error("Not authorised to manage this area")
  }

  await db
    .update(actions)
    .set({ status: "Closed", rag: "green", updatedAt: new Date() })
    .where(eq(actions.id, id))

  revalidateLog(existing.functionArea)
}
