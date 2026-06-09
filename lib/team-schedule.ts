import "server-only"
import { db } from "@/lib/db"
import { barbers, oneToOnes, threeSixtyCycles, user as userTable } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { sendOneToOneInvite } from "@/lib/team-notify"

/** Create a 1-2-1 for a barber at the given time, then email .ics invites to
 *  the barber + their manager. Returns the new row id. */
export async function scheduleOneToOne(barberId: number, when: Date): Promise<number> {
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  if (!barber) throw new Error("Barber not found")

  const [row] = await db
    .insert(oneToOnes)
    .values({
      barberId,
      managerUserId: barber.managerUserId,
      scheduledFor: when,
      status: "Scheduled",
      autoScheduled: false,
      inviteSentAt: new Date(),
    })
    .returning({ id: oneToOnes.id })

  // Resolve emails for the invite.
  const barberEmail = barber.userId
    ? (await db.select().from(userTable).where(eq(userTable.id, barber.userId)))[0]?.email
    : null
  const manager = barber.managerUserId
    ? (await db.select().from(userTable).where(eq(userTable.id, barber.managerUserId)))[0]
    : null

  await sendOneToOneInvite({
    oneToOneId: row.id,
    barberName: barber.name,
    barberEmail,
    managerName: manager?.name ?? null,
    managerEmail: manager?.email ?? null,
    scheduledFor: when,
  })
  return row.id
}

/** Has this barber had a 1-2-1 scheduled within the last `days` days? */
async function hasRecentOneToOne(barberId: number, days: number): Promise<boolean> {
  const [latest] = await db
    .select()
    .from(oneToOnes)
    .where(eq(oneToOnes.barberId, barberId))
    .orderBy(desc(oneToOnes.scheduledFor))
    .limit(1)
  if (!latest) return false
  const ageDays = (Date.now() - new Date(latest.scheduledFor).getTime()) / 864e5
  return ageDays < days
}

/** Auto-schedule monthly 1-2-1s: every active, linked barber with a manager
 *  who hasn't had one in ~30 days gets a new one a few days out. Idempotent —
 *  safe to run daily. Returns how many were created. */
export async function autoScheduleOneToOnes(now = new Date()): Promise<number> {
  const rows = await db.select().from(barbers).where(eq(barbers.active, true))
  let created = 0
  for (const b of rows) {
    if (!b.managerUserId) continue
    if (await hasRecentOneToOne(b.id, 28)) continue
    const when = new Date(now)
    when.setDate(when.getDate() + 5)
    when.setHours(10, 0, 0, 0)
    await scheduleOneToOne(b.id, when)
    created++
  }
  return created
}

/** Auto-open 360 cycles every 6 months. Opens a cycle for any active barber
 *  who has no cycle opened in the current half-year. Returns how many opened. */
export async function autoOpenThreeSixtyCycles(now = new Date()): Promise<number> {
  const half = now.getMonth() < 6 ? "H1" : "H2"
  const period = `${now.getFullYear()}-${half}`
  const rows = await db.select().from(barbers).where(eq(barbers.active, true))
  let opened = 0
  for (const b of rows) {
    const [existing] = await db
      .select()
      .from(threeSixtyCycles)
      .where(and(eq(threeSixtyCycles.barberId, b.id), eq(threeSixtyCycles.period, period)))
      .limit(1)
    if (existing) continue
    const due = new Date(now)
    due.setDate(due.getDate() + 21)
    await db.insert(threeSixtyCycles).values({
      barberId: b.id,
      period,
      dueOn: due.toISOString().slice(0, 10),
      status: "Open",
    })
    opened++
  }
  return opened
}
