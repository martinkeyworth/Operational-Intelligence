import "server-only"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user as userTable, barbers, sites } from "@/lib/db/schema"
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

  const base: AccessUser = {
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

  // Dashboard users manage every site implicitly, so only non-dashboard users
  // need their managed-site list resolved (drives the "My Site" experience for
  // site managers like branch managers who can't view the group dashboard).
  if (!base.canViewDashboard) {
    base.managedSiteIds = await getManagedSiteIds(base)
  }

  return base
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

// --- Site-scoped access (weekly confirmation / subletting for one site) -----
//
// A manager who does NOT have full dashboard access still needs to confirm
// their own site each week and record its subletting. We grant them the
// MINIMUM: access to the single site they run — never the group dashboard or
// any other site's data.
//
// A user "manages" a site if they have dashboard access (all sites), OR they
// are rostered as a barber at that site, OR they are NAMED as that site's
// manager (sites.manager_name — handles "Cosmin / Mario" pairings).

/** Site ids a non-dashboard user may manage (own workplace + named manager). */
export async function getManagedSiteIds(user: AccessUser): Promise<number[]> {
  const ids = new Set<number>()

  const myBarbers = await db
    .select({ siteId: barbers.siteId })
    .from(barbers)
    .where(eq(barbers.userId, user.id))
  for (const b of myBarbers) ids.add(b.siteId)

  const allSites = await db
    .select({ id: sites.id, managerName: sites.managerName })
    .from(sites)
  const full = user.name.toLowerCase().trim()
  const first = full.split(/\s+/)[0] ?? full
  for (const s of allSites) {
    const mn = (s.managerName ?? "").toLowerCase()
    if (!mn) continue
    const tokens = mn
      .split(/[/,&]|\band\b/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (tokens.some((t) => full.includes(t) || (first && t.includes(first))))
      ids.add(s.id)
  }
  return Array.from(ids)
}

/** Can this user view/act on a single site (without needing the dashboard)? */
export async function canManageSite(
  user: AccessUser,
  siteId: number,
): Promise<boolean> {
  if (user.canViewDashboard) return true
  if (!siteId) return false
  const ids = await getManagedSiteIds(user)
  return ids.includes(siteId)
}

/** Require access to a single site. Redirects unauthorised users to /no-access. */
export async function requireSiteAccess(siteId: number): Promise<AccessUser> {
  const user = await requireUser()
  if (!(await canManageSite(user, siteId))) redirect("/no-access")
  return user
}

/**
 * For a non-dashboard site manager, the path to their own site page (they run
 * the site but shouldn't see the group dashboard or the all-sites lists).
 * Returns null for dashboard users and plain barbers with no managed site.
 */
export function managerSiteLanding(user: AccessUser): string | null {
  if (user.canViewDashboard) return null
  const ids = user.managedSiteIds ?? []
  return ids.length > 0 ? `/my-site/${ids[0]}` : null
}

/** Only company-domain dashboard users may administer people/capabilities. */
export async function requireAdmin(): Promise<AccessUser> {
  const user = await requireUser()
  if (!user.isCompany || !user.canViewDashboard) redirect("/no-access")
  return user
}

/** A signed-in user who may manage the Team Area (HR roster + linking).
 *  Company dashboard users; owners implicitly included. */
export async function requireTeamAdmin(): Promise<AccessUser> {
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

// --- L&D access ------------------------------------------------------------

/** Who can manage the course catalogue, role gates/prereqs and edit ANY plan.
 *  Owners, dashboard admins, and the Training area lead. */
export function canManageLearning(user: AccessUser): boolean {
  if (user.isOwner) return true
  if (user.isTrainingLead) return true
  if (user.leadAreas.includes("Training")) return true
  // Company dashboard users administer L&D alongside the training lead.
  return user.isCompany && user.canViewDashboard
}

/** Require L&D-management rights. Redirects otherwise. */
export async function requireLearningManager(): Promise<AccessUser> {
  const user = await requireUser()
  if (!canManageLearning(user)) redirect("/no-access")
  return user
}

/** Can this user rate PBC / hold the monthly 1-2-1 for a given barber?
 *  L&D managers can rate anyone; a barber's assigned manager can rate them. */
export function canRatePbc(user: AccessUser, barberManagerUserId: string | null | undefined): boolean {
  if (canManageLearning(user)) return true
  return Boolean(barberManagerUserId && barberManagerUserId === user.id)
}

/** Alias — the same rule gates running a 1-2-1 as rating PBC. */
export const canHoldOneToOne = canRatePbc

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
