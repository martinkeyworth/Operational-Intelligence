import "server-only"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import {
  COMPANY_DOMAIN,
  isCompanyEmail,
  isOwnerEmail,
  CAPABILITY_LABELS,
  type Capabilities,
  type AccessUser,
} from "@/lib/access-types"

// ---------------------------------------------------------------------------
// ACCESS CONTROL  —  single source of truth for who can see/do what.
//
// Rules:
//  - Anyone with an @lessthanzerobarbers.com email is a "company" user and,
//    by default, can view the executive dashboard.
//  - Everyone else is treated as a barber: weekly data input only, no dashboard.
//  - Company users carry capability flags that can be toggled on the Admin →
//    People page: View Dashboard, Barber, Training Lead, HR Lead, Social Media.
// ---------------------------------------------------------------------------

export { COMPANY_DOMAIN, isCompanyEmail, isOwnerEmail, CAPABILITY_LABELS }
export type { Capabilities, AccessUser }

/** Load the current signed-in user with capability flags, or null. */
export async function getAccessUser(): Promise<AccessUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const [row] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isCompany: isCompanyEmail(row.email),
    isOwner: isOwnerEmail(row.email),
    leadAreas: parseLeadAreas(row.leadAreas),
    canViewDashboard: row.canViewDashboard,
    isBarber: row.isBarber,
    isTrainingLead: row.isTrainingLead,
    isHrLead: row.isHrLead,
    isSocialMedia: row.isSocialMedia,
  }
}

/** Require a signed-in user (any). Redirects to /sign-in otherwise. */
export async function requireUser(): Promise<AccessUser> {
  const user = await getAccessUser()
  if (!user) redirect("/sign-in")
  return user
}

/** Require dashboard-viewing access. Redirects unauthorised users to /no-access. */
export async function requireDashboard(): Promise<AccessUser> {
  const user = await requireUser()
  if (!user.canViewDashboard) redirect("/no-access")
  return user
}

/** Require the ability to enter weekly data (barbers + any dashboard user). */
export async function requireDataEntry(): Promise<AccessUser> {
  const user = await requireUser()
  if (!user.isBarber && !user.canViewDashboard) redirect("/no-access")
  return user
}

/** Only company-domain dashboard users may administer people/capabilities. */
export async function requireAdmin(): Promise<AccessUser> {
  const user = await requireUser()
  if (!user.isCompany || !user.canViewDashboard) redirect("/no-access")
  return user
}

/** Owners only (Martin & Cosmin). Gates the secure Split area. */
export async function requireOwner(): Promise<AccessUser> {
  const user = await requireUser()
  if (!user.isOwner) redirect("/no-access")
  return user
}

/** Parse the comma-separated lead_areas column into a clean string array. */
export function parseLeadAreas(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Serialise an array of area keys back into the stored comma-separated form. */
export function serializeLeadAreas(areas: string[]): string {
  return Array.from(new Set(areas.map((s) => s.trim()).filter(Boolean))).join(",")
}

/** Map a functional area key -> the legacy capability flag (where one exists).
 *  Retained as a fallback so pre-existing leads keep access before migration. */
export function areaLeadFlag(
  areaKey: string,
): keyof Pick<Capabilities, "isHrLead" | "isSocialMedia" | "isTrainingLead"> | null {
  switch (areaKey) {
    case "HR":
      return "isHrLead"
    case "Marketing":
      return "isSocialMedia"
    case "Training":
      return "isTrainingLead"
    default:
      return null
  }
}

/** Can this user input data / manage the RAID log for the given area?
 *  Owners manage all areas; otherwise the user must lead that area (via
 *  leadAreas, with the legacy capability flag as a fallback). */
export function canInputArea(user: AccessUser, areaKey: string): boolean {
  if (user.isOwner) return true
  if (user.leadAreas.includes(areaKey)) return true
  const flag = areaLeadFlag(areaKey)
  return flag ? Boolean(user[flag]) : false
}

/** Require input rights for a functional area. Redirects otherwise. */
export async function requireAreaLead(areaKey: string): Promise<AccessUser> {
  const user = await requireUser()
  if (!canInputArea(user, areaKey)) redirect("/no-access")
  return user
}

/** List every user with capability flags, for the admin People page. */
export async function getAllUsers(): Promise<AccessUser[]> {
  const rows = await db.select().from(userTable).orderBy(userTable.email)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    isCompany: isCompanyEmail(row.email),
    isOwner: isOwnerEmail(row.email),
    leadAreas: parseLeadAreas(row.leadAreas),
    canViewDashboard: row.canViewDashboard,
    isBarber: row.isBarber,
    isTrainingLead: row.isTrainingLead,
    isHrLead: row.isHrLead,
    isSocialMedia: row.isSocialMedia,
  }))
}
