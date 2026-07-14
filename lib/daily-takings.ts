import "server-only"
import { db } from "@/lib/db"
import { dailyTakings, weeklyTakings, barbers } from "@/lib/db/schema"
import { and, eq, gte, lte, sql } from "drizzle-orm"
import { weekEndingFor, weekDates } from "@/lib/format"
import { computeRtb } from "@/lib/rtb"

// ---------------------------------------------------------------------------
// Daily takings capture + weekly rollup
// ---------------------------------------------------------------------------
// Barbers log each DAY's cash + card (via the entry app → /api/ingest). We
// store one row per barber per date, then recompute the barber's weekly_takings
// rollup (cash/card = sum of the week's days; cash_rent/card_rent = RTB engine).
// Everything downstream (getBarberWeek, reporting, RAG) keeps reading
// weekly_takings unchanged, so the daily layer is additive + low-risk.

export type DailyRow = {
  date: string
  cash: number
  card: number
}

/**
 * Upsert one barber-day of takings and recompute that barber's weekly rollup.
 * Returns the stored day plus the recomputed week-to-date totals.
 */
export async function recordDailyTakings(args: {
  barberId: number
  siteId: number
  date: string
  cash: number
  card: number
  enteredByUserId?: string | null
  source?: string
}) {
  const { barberId, siteId, date } = args
  const cash = Math.max(0, Number(args.cash) || 0)
  const card = Math.max(0, Number(args.card) || 0)

  await db
    .insert(dailyTakings)
    .values({
      barberId,
      siteId,
      date,
      cash: String(cash),
      card: String(card),
      source: args.source ?? "entry-app",
      enteredByUserId: args.enteredByUserId ?? null,
    })
    .onConflictDoUpdate({
      target: [dailyTakings.barberId, dailyTakings.date],
      set: {
        cash: String(cash),
        card: String(card),
        siteId,
        enteredByUserId: args.enteredByUserId ?? null,
        source: args.source ?? "entry-app",
        updatedAt: new Date(),
      },
    })

  const weekEnding = weekEndingFor(date)
  const rollup = await recomputeWeeklyRollup(barberId, weekEnding)
  return { date, cash, card, weekEnding, rollup }
}

/**
 * Sum a barber's daily rows for the given week, compute RTB, and upsert the
 * weekly_takings row. Returns the resulting weekly totals + RTB split.
 */
export async function recomputeWeeklyRollup(barberId: number, weekEnding: string) {
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  if (!barber) return null

  const dates = weekDates(weekEnding)
  const rows = await db
    .select()
    .from(dailyTakings)
    .where(
      and(
        eq(dailyTakings.barberId, barberId),
        gte(dailyTakings.date, dates[0]),
        lte(dailyTakings.date, dates[6]),
      ),
    )

  const cash = rows.reduce((s, r) => s + Number(r.cash), 0)
  const card = rows.reduce((s, r) => s + Number(r.card), 0)
  const total = cash + card

  const rtb = computeRtb({
    cash,
    card,
    barberPct: barber.barberPct == null ? null : Number(barber.barberPct),
    cardCap: barber.cardRtbCap == null ? null : Number(barber.cardRtbCap),
  })

  await db
    .insert(weeklyTakings)
    .values({
      barberId,
      siteId: barber.siteId,
      weekEnding,
      total: String(total),
      cash: String(cash),
      card: String(card),
      cashRent: String(rtb.cashRent),
      cardRent: String(rtb.cardRent),
      manager: barber.name,
    })
    .onConflictDoUpdate({
      target: [weeklyTakings.barberId, weeklyTakings.weekEnding],
      set: {
        siteId: barber.siteId,
        total: String(total),
        cash: String(cash),
        card: String(card),
        cashRent: String(rtb.cashRent),
        cardRent: String(rtb.cardRent),
      },
    })

  return { cash, card, total, ...rtb, days: rows.length }
}

/** A barber's daily rows for a given week (Sun→Sat), for the entry app + review. */
export async function getBarberDailyWeek(
  barberId: number,
  weekEnding: string,
): Promise<DailyRow[]> {
  const dates = weekDates(weekEnding)
  const rows = await db
    .select()
    .from(dailyTakings)
    .where(
      and(
        eq(dailyTakings.barberId, barberId),
        gte(dailyTakings.date, dates[0]),
        lte(dailyTakings.date, dates[6]),
      ),
    )
  return rows.map((r) => ({
    date: String(r.date),
    cash: Number(r.cash),
    card: Number(r.card),
  }))
}

export type DailyBusinessTotal = {
  date: string
  cash: number
  card: number
  total: number
}

/** Per-day cash/card/total across the whole business for a week, for the
 *  "this week so far" dashboard strip. */
export async function getDailyBusinessTotals(
  weekEnding: string,
): Promise<DailyBusinessTotal[]> {
  const dates = weekDates(weekEnding)
  const rows = await db
    .select({
      date: dailyTakings.date,
      cash: sql<string>`sum(${dailyTakings.cash})`,
      card: sql<string>`sum(${dailyTakings.card})`,
    })
    .from(dailyTakings)
    .where(and(gte(dailyTakings.date, dates[0]), lte(dailyTakings.date, dates[6])))
    .groupBy(dailyTakings.date)

  const byDate = new Map(rows.map((r) => [String(r.date), r]))
  return dates.map((date) => {
    const r = byDate.get(date)
    const cash = r ? Number(r.cash) : 0
    const card = r ? Number(r.card) : 0
    return { date, cash, card, total: cash + card }
  })
}
