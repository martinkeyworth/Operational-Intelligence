import "server-only"
import { db } from "@/lib/db"
import {
  barbers,
  sites,
  courses,
  courseRoleReqs,
  roleGates,
  learningPlans,
  learningPlanItems,
  pbcRatings,
  oneToOnes,
} from "@/lib/db/schema"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { ROLES } from "@/lib/roles"
import {
  ONE_TO_ONE_TEMPLATE_VERSION,
  currentPeriod,
  periodOf,
  suggestPbcFromAnswers,
  type SelfPrep,
  type ManagerAnswers,
  type OneToOneAnswers,
  type PlanItemStatus,
  type CourseRequirement,
} from "@/lib/learning-types"

// ---------------------------------------------------------------------------
// L&D SERVER DATA LAYER — catalogue, role gates, plans, PBC, monthly 1-2-1.
// Reads/writes the existing one_to_ones table (extended) + the L&D tables.
// ---------------------------------------------------------------------------

// --- Role options (canonical ladder from lib/roles.ts) ---------------------

export type RoleOption = { key: string; title: string; tier: string }

export function roleOptions(): RoleOption[] {
  return ROLES.map((r) => ({ key: r.key, title: r.title, tier: r.tier }))
}

export function roleTitle(key: string | null | undefined): string {
  if (!key) return "—"
  return ROLES.find((r) => r.key === key)?.title ?? key
}

// --- Courses / catalogue ---------------------------------------------------

export type CourseRow = typeof courses.$inferSelect
export type RoleReqRow = typeof courseRoleReqs.$inferSelect

export async function listCourses(includeInactive = true): Promise<CourseRow[]> {
  const rows = await db.select().from(courses).orderBy(asc(courses.sort), asc(courses.title))
  return includeInactive ? rows : rows.filter((c) => c.active)
}

export async function listCourseRoleReqs(): Promise<RoleReqRow[]> {
  return db.select().from(courseRoleReqs)
}

/** Courses grouped by category, each with its role requirements attached. */
export async function coursesByCategory(): Promise<
  { category: string; courses: (CourseRow & { reqs: RoleReqRow[] })[] }[]
> {
  const [rows, reqs] = await Promise.all([listCourses(), listCourseRoleReqs()])
  const byCourse = new Map<number, RoleReqRow[]>()
  for (const r of reqs) {
    const arr = byCourse.get(r.courseId) ?? []
    arr.push(r)
    byCourse.set(r.courseId, arr)
  }
  const groups = new Map<string, (CourseRow & { reqs: RoleReqRow[] })[]>()
  for (const c of rows) {
    const cat = c.category || "General"
    const arr = groups.get(cat) ?? []
    arr.push({ ...c, reqs: byCourse.get(c.id) ?? [] })
    groups.set(cat, arr)
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, list]) => ({ category, courses: list }))
}

/** Required + recommended courses for a role. */
export async function getCoursesForRole(
  role: string,
): Promise<{ required: CourseRow[]; recommended: CourseRow[] }> {
  // Plans store the role KEY (e.g. "senior-barber") but course_role_reqs.role
  // holds the TITLE (e.g. "Senior Barber"). Match on either so both the current
  // key-based plans and any legacy title-valued plans resolve correctly.
  const candidates = Array.from(new Set([role, roleTitle(role)]))
  const reqs = await db.select().from(courseRoleReqs).where(inArray(courseRoleReqs.role, candidates))
  if (reqs.length === 0) return { required: [], recommended: [] }
  const courseRows = await db
    .select()
    .from(courses)
    .where(inArray(courses.id, reqs.map((r) => r.courseId)))
  const byId = new Map(courseRows.map((c) => [c.id, c]))
  const required: CourseRow[] = []
  const recommended: CourseRow[] = []
  for (const r of reqs) {
    const c = byId.get(r.courseId)
    if (!c) continue
    if (r.requirement === "recommended") recommended.push(c)
    else required.push(c)
  }
  return { required, recommended }
}

export async function createCourse(data: {
  title: string
  description?: string | null
  provider?: string | null
  category?: string | null
  delivery?: string | null
  durationNote?: string | null
}) {
  const [row] = await db.insert(courses).values(data).returning()
  return row
}

export async function updateCourse(
  id: number,
  data: Partial<{
    title: string
    description: string | null
    provider: string | null
    category: string | null
    delivery: string | null
    durationNote: string | null
    sort: number
  }>,
) {
  await db.update(courses).set(data).where(eq(courses.id, id))
}

export async function setCourseActive(id: number, active: boolean) {
  await db.update(courses).set({ active }).where(eq(courses.id, id))
}

export async function setCourseRoleReq(courseId: number, role: string, requirement: CourseRequirement) {
  const [existing] = await db
    .select()
    .from(courseRoleReqs)
    .where(and(eq(courseRoleReqs.courseId, courseId), eq(courseRoleReqs.role, role)))
  if (existing) {
    await db.update(courseRoleReqs).set({ requirement }).where(eq(courseRoleReqs.id, existing.id))
  } else {
    await db.insert(courseRoleReqs).values({ courseId, role, requirement })
  }
}

export async function removeCourseRoleReq(courseId: number, role: string) {
  await db
    .delete(courseRoleReqs)
    .where(and(eq(courseRoleReqs.courseId, courseId), eq(courseRoleReqs.role, role)))
}

// --- Role gates ------------------------------------------------------------

export type RoleGateRow = typeof roleGates.$inferSelect

export async function listRoleGates(): Promise<RoleGateRow[]> {
  return db.select().from(roleGates).orderBy(asc(roleGates.role), asc(roleGates.sort))
}

export async function gatesForRole(role: string): Promise<RoleGateRow[]> {
  // Match on role key or title (see getCoursesForRole for why).
  const candidates = Array.from(new Set([role, roleTitle(role)]))
  return db.select().from(roleGates).where(inArray(roleGates.role, candidates)).orderBy(asc(roleGates.sort))
}

export async function addRoleGate(role: string, requirement: string) {
  const [row] = await db.insert(roleGates).values({ role, requirement }).returning()
  return row
}

export async function removeRoleGate(id: number) {
  await db.delete(roleGates).where(eq(roleGates.id, id))
}

// --- Plans -----------------------------------------------------------------

export type PlanItemRow = typeof learningPlanItems.$inferSelect

/** Ensure a plan row exists for a barber; returns it. */
export async function ensurePlan(barberId: number) {
  const [existing] = await db.select().from(learningPlans).where(eq(learningPlans.barberId, barberId))
  if (existing) return existing
  const [created] = await db.insert(learningPlans).values({ barberId }).returning()
  return created
}

export type PlanForBarber = {
  plan: typeof learningPlans.$inferSelect
  items: (PlanItemRow & { courseTitle: string | null })[]
  targetRole: string | null
  targetRoleTitle: string
  requiredCourses: { course: CourseRow; met: boolean }[]
  recommendedCourses: CourseRow[]
  gates: RoleGateRow[]
  progressPct: number
  reviewDue: boolean
}

/** A barber's plan with items, progression tracker and review status. */
export async function getPlanForBarber(barberId: number): Promise<PlanForBarber> {
  const plan = await ensurePlan(barberId)
  const itemRows = await db
    .select()
    .from(learningPlanItems)
    .where(eq(learningPlanItems.planId, plan.id))
    .orderBy(asc(learningPlanItems.id))

  const courseIds = itemRows.map((i) => i.courseId).filter((x): x is number => x != null)
  const courseRows =
    courseIds.length > 0 ? await db.select().from(courses).where(inArray(courses.id, courseIds)) : []
  const courseById = new Map(courseRows.map((c) => [c.id, c]))
  const items = itemRows.map((i) => ({
    ...i,
    courseTitle: i.courseId ? (courseById.get(i.courseId)?.title ?? null) : null,
  }))

  const target = plan.targetRole
  let requiredCourses: { course: CourseRow; met: boolean }[] = []
  let recommendedCourses: CourseRow[] = []
  let gates: RoleGateRow[] = []
  if (target) {
    const { required, recommended } = await getCoursesForRole(target)
    gates = await gatesForRole(target)
    const completedCourseIds = new Set(
      items.filter((i) => i.status === "complete" && i.courseId).map((i) => i.courseId as number),
    )
    requiredCourses = required.map((c) => ({ course: c, met: completedCourseIds.has(c.id) }))
    recommendedCourses = recommended
  }
  const metCount = requiredCourses.filter((r) => r.met).length
  const progressPct =
    requiredCourses.length > 0 ? Math.round((metCount / requiredCourses.length) * 100) : 0

  // Review is due if never reviewed, or last review was in an earlier period.
  const reviewDue =
    !plan.lastReviewedAt || periodOf(new Date(plan.lastReviewedAt)) < currentPeriod()

  return {
    plan,
    items,
    targetRole: target,
    targetRoleTitle: roleTitle(target),
    requiredCourses,
    recommendedCourses,
    gates,
    progressPct,
    reviewDue,
  }
}

export async function savePlanMeta(
  barberId: number,
  data: { targetRole?: string | null; aspiration?: string | null },
) {
  await ensurePlan(barberId)
  await db
    .update(learningPlans)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(learningPlans.barberId, barberId))
}

export async function addPlanItem(
  barberId: number,
  data: { courseId?: number | null; title?: string | null; targetDate?: string | null; notes?: string | null },
) {
  const plan = await ensurePlan(barberId)
  await db.insert(learningPlanItems).values({
    planId: plan.id,
    courseId: data.courseId ?? null,
    title: data.title ?? null,
    targetDate: data.targetDate ?? null,
    notes: data.notes ?? null,
  })
}

export async function updatePlanItem(
  itemId: number,
  data: Partial<{ status: PlanItemStatus; targetDate: string | null; completedOn: string | null; notes: string | null }>,
) {
  const patch: Record<string, unknown> = { ...data }
  if (data.status === "complete" && data.completedOn === undefined) {
    patch.completedOn = new Date().toISOString().slice(0, 10)
  }
  await db.update(learningPlanItems).set(patch).where(eq(learningPlanItems.id, itemId))
}

export async function deletePlanItem(itemId: number) {
  await db.delete(learningPlanItems).where(eq(learningPlanItems.id, itemId))
}

export async function markPlanReviewed(barberId: number, when = new Date()) {
  await ensurePlan(barberId)
  await db
    .update(learningPlans)
    .set({ lastReviewedAt: when, updatedAt: new Date() })
    .where(eq(learningPlans.barberId, barberId))
}

// --- PBC ratings -----------------------------------------------------------

export type PbcRow = typeof pbcRatings.$inferSelect

export async function getPbcForBarber(
  barberId: number,
): Promise<{ latest: PbcRow | null; history: PbcRow[] }> {
  const history = await db
    .select()
    .from(pbcRatings)
    .where(eq(pbcRatings.barberId, barberId))
    .orderBy(desc(pbcRatings.period))
  return { latest: history[0] ?? null, history }
}

export async function getPbcForPeriod(barberId: number, period: string): Promise<PbcRow | null> {
  const [row] = await db
    .select()
    .from(pbcRatings)
    .where(and(eq(pbcRatings.barberId, barberId), eq(pbcRatings.period, period)))
  return row ?? null
}

export async function upsertPbcRating(data: {
  barberId: number
  period: string
  performance: number
  behaviours: number
  contribution: number
  overall: number
  comment?: string | null
  ratedBy?: string | null
  ratedByName?: string | null
  oneToOneId?: number | null
}) {
  const existing = await getPbcForPeriod(data.barberId, data.period)
  if (existing) {
    await db
      .update(pbcRatings)
      .set({
        performance: data.performance,
        behaviours: data.behaviours,
        contribution: data.contribution,
        overall: data.overall,
        comment: data.comment ?? null,
        ratedBy: data.ratedBy ?? null,
        ratedByName: data.ratedByName ?? null,
        oneToOneId: data.oneToOneId ?? existing.oneToOneId,
        updatedAt: new Date(),
      })
      .where(eq(pbcRatings.id, existing.id))
    return existing.id
  }
  const [row] = await db
    .insert(pbcRatings)
    .values({
      barberId: data.barberId,
      period: data.period,
      performance: data.performance,
      behaviours: data.behaviours,
      contribution: data.contribution,
      overall: data.overall,
      comment: data.comment ?? null,
      ratedBy: data.ratedBy ?? null,
      ratedByName: data.ratedByName ?? null,
      oneToOneId: data.oneToOneId ?? null,
    })
    .returning()
  return row.id
}

// --- Monthly 1-2-1 (reads/writes the existing one_to_ones table) -----------

export type OneToOneRow = typeof oneToOnes.$inferSelect

/** The most recent / open monthly 1-2-1 for a barber, with its self-prep and
 *  manager answers typed. */
export async function getCurrentOneToOne(barberId: number): Promise<OneToOneRow | null> {
  // The "current" 1-2-1 is the one for the CURRENT period — this is what the
  // learning roster shows, so every surface stays consistent. A leftover row
  // from a previous month must never masquerade as the current status.
  const period = currentPeriod()
  const [row] = await db
    .select()
    .from(oneToOnes)
    .where(and(eq(oneToOnes.barberId, barberId), eq(oneToOnes.period, period)))
    .orderBy(desc(oneToOnes.scheduledFor))
    .limit(1)
  return row ?? null
}

export function readSelfPrep(row: OneToOneRow | null): SelfPrep {
  return (row?.selfPrep as SelfPrep) ?? {}
}

export function readManagerAnswers(row: OneToOneRow | null): ManagerAnswers {
  return (row?.managerAnswers as ManagerAnswers) ?? {}
}

/** Save the barber's self-prep answers + PBC self-scores (only while draft). */
export async function saveSelfPrep(oneToOneId: number, prep: SelfPrep) {
  const [row] = await db.select().from(oneToOnes).where(eq(oneToOnes.id, oneToOneId))
  if (!row || row.status === "Completed") return
  const current = readSelfPrep(row)
  await db
    .update(oneToOnes)
    .set({ selfPrep: { ...current, ...prep, submittedAt: new Date().toISOString() } })
    .where(eq(oneToOnes.id, oneToOneId))
}

/** Save the manager's answers (draft) — does not complete the 1-2-1. */
export async function saveManagerAnswers(oneToOneId: number, ma: ManagerAnswers) {
  const [row] = await db.select().from(oneToOnes).where(eq(oneToOnes.id, oneToOneId))
  if (!row) return
  const current = readManagerAnswers(row)
  await db
    .update(oneToOnes)
    .set({ managerAnswers: { ...current, ...ma } })
    .where(eq(oneToOnes.id, oneToOneId))
}

/** Open (create) a monthly 1-2-1 for a barber for the current period if none. */
export async function openOneToOne(barberId: number, managerUserId: string | null) {
  const period = currentPeriod()
  const [existing] = await db
    .select()
    .from(oneToOnes)
    .where(and(eq(oneToOnes.barberId, barberId), eq(oneToOnes.period, period)))
  if (existing) return existing
  const now = new Date()
  const due = new Date(now)
  due.setDate(due.getDate() + 3)
  const [row] = await db
    .insert(oneToOnes)
    .values({
      barberId,
      managerUserId,
      scheduledFor: now,
      status: "Scheduled",
      autoScheduled: false,
      period,
      templateVersion: ONE_TO_ONE_TEMPLATE_VERSION,
      dueOn: due.toISOString().slice(0, 10),
    })
    .returning()
  return row
}

/**
 * Complete a 1-2-1. Derives/accepts the final PBC scores, writes pbc_ratings
 * for the period linked to this 1-2-1, marks the plan reviewed, and stamps the
 * 1-2-1 Completed. Returns the resulting PBC id.
 */
export async function completeOneToOne(
  oneToOneId: number,
  opts: {
    managerAnswers: OneToOneAnswers
    performance: number
    behaviours: number
    contribution: number
    overall: number
    summary?: string | null
    actions?: string | null
    comment?: string | null
    differenceReason?: string | null
    ratedBy?: string | null
    ratedByName?: string | null
  },
) {
  const [row] = await db.select().from(oneToOnes).where(eq(oneToOnes.id, oneToOneId))
  if (!row) throw new Error("1-2-1 not found")
  const period = row.period ?? periodOf(new Date(row.scheduledFor))
  const now = new Date()

  const existingMa = readManagerAnswers(row)
  await db
    .update(oneToOnes)
    .set({
      status: "Completed",
      completedAt: now,
      summary: opts.summary ?? row.summary,
      actions: opts.actions ?? row.actions,
      pbcPerformance: opts.performance,
      pbcBehaviours: opts.behaviours,
      pbcContribution: opts.contribution,
      managerAnswers: {
        ...existingMa,
        answers: opts.managerAnswers,
        differenceReason: opts.differenceReason ?? existingMa.differenceReason ?? null,
      },
    })
    .where(eq(oneToOnes.id, oneToOneId))

  const pbcId = await upsertPbcRating({
    barberId: row.barberId,
    period,
    performance: opts.performance,
    behaviours: opts.behaviours,
    contribution: opts.contribution,
    overall: opts.overall,
    comment: opts.comment ?? null,
    ratedBy: opts.ratedBy ?? null,
    ratedByName: opts.ratedByName ?? null,
    oneToOneId,
  })

  await markPlanReviewed(row.barberId, now)
  return pbcId
}

/** Suggested PBC from the barber's own self-prep answers (for the two-stage UI). */
export function suggestFromSelfPrep(prep: SelfPrep) {
  return suggestPbcFromAnswers(prep.answers ?? {})
}

// --- Leadership / manager roster -------------------------------------------

export type LearningRosterRow = {
  barberId: number
  name: string
  role: string
  siteName: string
  targetRoleTitle: string
  planProgressPct: number
  reviewDue: boolean
  period: string
  oneToOneStatus: string
  oneToOneId: number | null
  pbcOverall: number | null
}

/** Does this user manage at least one active barber? Used to let a non-exec
 *  branch manager into the learning roster (scoped to their own team). */
export async function hasDirectReports(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: barbers.id })
    .from(barbers)
    .where(and(eq(barbers.active, true), eq(barbers.managerUserId, userId)))
    .limit(1)
  return rows.length > 0
}

/** Roster for /learning/plans. If managerUserId is given, only that manager's
 *  direct reports; otherwise everyone (admin/training lead). */
export async function getLearningRoster(managerUserId?: string | null): Promise<LearningRosterRow[]> {
  const base = db.select().from(barbers).where(eq(barbers.active, true))
  const barberRows = managerUserId
    ? (await base).filter((b) => b.managerUserId === managerUserId)
    : await base
  const siteRows = await db.select().from(sites)
  const period = currentPeriod()
  const siteName = (id: number) => siteRows.find((s) => s.id === id)?.name ?? "—"

  const out: LearningRosterRow[] = []
  for (const b of barberRows) {
    const plan = await getPlanForBarber(b.id)
    const [oto] = await db
      .select()
      .from(oneToOnes)
      .where(and(eq(oneToOnes.barberId, b.id), eq(oneToOnes.period, period)))
      .limit(1)
    const pbc = await getPbcForPeriod(b.id, period)
    out.push({
      barberId: b.id,
      name: b.name,
      role: b.role,
      siteName: siteName(b.siteId),
      targetRoleTitle: plan.targetRoleTitle,
      planProgressPct: plan.progressPct,
      reviewDue: plan.reviewDue,
      period,
      oneToOneStatus: oto?.status ?? "None",
      oneToOneId: oto?.id ?? null,
      pbcOverall: pbc?.overall ?? null,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Basic barber identity for the plan detail page header. */
export async function getBarberBasics(barberId: number) {
  const [b] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  if (!b) return null
  const [site] = await db.select().from(sites).where(eq(sites.id, b.siteId))
  return {
    id: b.id,
    name: b.name,
    role: b.role,
    siteName: site?.name ?? "—",
    userId: b.userId,
    managerUserId: b.managerUserId,
  }
}

// --- Barber "My development" aggregate (for the /team page) -----------------

/** Everything the barber's own L&D area (<MyLearning/>) needs in one call. */
export async function getMyLearningData(barberId: number) {
  const plan = await getPlanForBarber(barberId)
  const { history } = await getPbcForBarber(barberId)
  const current = await getCurrentOneToOne(barberId)

  const pbcHistory = history.map((h) => ({
    period: h.period,
    performance: h.performance,
    behaviours: h.behaviours,
    contribution: h.contribution,
    overall: h.overall,
    ratedByName: h.ratedByName,
    comment: h.comment,
  }))

  return {
    targetRoleTitle: plan.targetRoleTitle,
    aspiration: plan.plan.aspiration,
    progressPct: plan.progressPct,
    items: plan.items.map((i) => ({
      id: i.id,
      courseTitle: i.courseTitle,
      title: i.title,
      status: i.status,
      targetDate: i.targetDate,
    })),
    requiredCourses: plan.requiredCourses.map((r) => ({
      course: { id: r.course.id, title: r.course.title },
      met: r.met,
    })),
    pbcHistory,
    oneToOne: {
      id: current?.id ?? null,
      status: current?.status ?? "None",
      period: current?.period ?? currentPeriod(),
      selfPrep: readSelfPrep(current),
    },
  }
}
