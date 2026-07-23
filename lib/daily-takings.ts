import "server-only"
import { db } from "@/lib/db"
import {
  dailyTakings,
  weeklyTakings,
  barbers,
  takingsLineEntries,
} from "@/lib/db/schema"
import { and, eq, gte, lte, sql, desc } from "drizzle-orm"
import { weekEndingFor, weekDates } from "@/lib/format"
import { computeRtb } from "@/lib/rtb"

export type TakingsMethod = "cash" | "card"
export type TakingsKind = "cut" | "no_show" | "tip"

export type TakingsLine = {
  id: number
  amount: number
  method: TakingsMethod
  kind: TakingsKind
  /** No-shows only: null = awaiting sign-off, true = paid, false = not paid. */
  noShowPaid: boolean | null
  createdAt: string
}

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
  tips: number
  unconfirmedNoShows: number
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
  tips?: number
  unconfirmedNoShows?: number
  enteredByUserId?: string | null
  source?: string
}) {
  const { barberId, siteId, date } = args
  const cash = Math.max(0, Number(args.cash) || 0)
  const card = Math.max(0, Number(args.card) || 0)
  const tips = Math.max(0, Number(args.tips) || 0)
  const unconfirmedNoShows = Math.max(0, Number(args.unconfirmedNoShows) || 0)

  await db
    .insert(dailyTakings)
    .values({
      barberId,
      siteId,
      date,
      cash: String(cash),
      card: String(card),
      tips: String(tips),
      unconfirmedNoShows: String(unconfirmedNoShows),
      source: args.source ?? "entry-app",
      enteredByUserId: args.enteredByUserId ?? null,
    })
    .onConflictDoUpdate({
      target: [dailyTakings.barberId, dailyTakings.date],
      set: {
        cash: String(cash),
        card: String(card),
        tips: String(tips),
        unconfirmedNoShows: String(unconfirmedNoShows),
        siteId,
        enteredByUserId: args.enteredByUserId ?? null,
        source: args.source ?? "entry-app",
        updatedAt: new Date(),
      },
    })

  const weekEnding = weekEndingFor(date)
  const rollup = await recomputeWeeklyRollup(barberId, weekEnding)
  return { date, cash, card, tips, unconfirmedNoShows, weekEnding, rollup }
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

  // Revenue = confirmed cash + card only (the RTB engine never sees tips or
  // unconfirmed no-shows).
  const cash = rows.reduce((s, r) => s + Number(r.cash), 0)
  const card = rows.reduce((s, r) => s + Number(r.card), 0)
  const tips = rows.reduce((s, r) => s + Number(r.tips ?? 0), 0)
  const unconfirmedNoShows = rows.reduce(
    (s, r) => s + Number(r.unconfirmedNoShows ?? 0),
    0,
  )
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
      tips: String(tips),
      unconfirmedNoShows: String(unconfirmedNoShows),
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
        tips: String(tips),
        unconfirmedNoShows: String(unconfirmedNoShows),
        cashRent: String(rtb.cashRent),
        cardRent: String(rtb.cardRent),
      },
    })

  return { cash, card, tips, unconfirmedNoShows, total, ...rtb, days: rows.length }
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
    tips: Number(r.tips ?? 0),
    unconfirmedNoShows: Number(r.unconfirmedNoShows ?? 0),
  }))
}

export type WeekTakings = {
  cash: number
  card: number
  total: number
  /** Tips this week (100% barber, not part of revenue/split/RTB). */
  tips: number
  /** No-shows logged but not yet confirmed paid (not revenue). */
  unconfirmedNoShows: number
  /** Number of days with entries (0 when figures came from the weekly total). */
  daysEntered: number
  /** Where the figures came from — per-cut daily rows or the weekly entry. */
  source: "daily" | "weekly" | "none"
}

/**
 * Resolve a barber's cash/card for a week, preferring the per-cut DAILY rows
 * but FALLING BACK to the weekly_takings figure the barber (or manager) entered.
 *
 * This is the single source of truth for "what did this barber take this week"
 * used by the confirmation review + discrepancy detector. Without the fallback,
 * a barber who entered their weekly total (but never logged per-cut days) shows
 * as £0 / "no takings entered", which is wrong.
 */
export async function getBarberWeekTakings(
  barberId: number,
  weekEnding: string,
): Promise<WeekTakings> {
  const days = await getBarberDailyWeek(barberId, weekEnding)
  const dailyCash = days.reduce((s, d) => s + d.cash, 0)
  const dailyCard = days.reduce((s, d) => s + d.card, 0)
  const dailyTips = days.reduce((s, d) => s + d.tips, 0)
  const dailyNoShows = days.reduce((s, d) => s + d.unconfirmedNoShows, 0)
  const daysEntered = days.filter(
    (d) => d.cash > 0 || d.card > 0 || d.tips > 0 || d.unconfirmedNoShows > 0,
  ).length

  if (dailyCash + dailyCard + dailyTips + dailyNoShows > 0) {
    return {
      cash: dailyCash,
      card: dailyCard,
      total: dailyCash + dailyCard,
      tips: dailyTips,
      unconfirmedNoShows: dailyNoShows,
      daysEntered,
      source: "daily",
    }
  }

  // Fall back to the weekly rollup / weekly entry.
  const [wk] = await db
    .select({
      total: weeklyTakings.total,
      cash: weeklyTakings.cash,
      card: weeklyTakings.card,
      tips: weeklyTakings.tips,
      unconfirmedNoShows: weeklyTakings.unconfirmedNoShows,
    })
    .from(weeklyTakings)
    .where(
      and(
        eq(weeklyTakings.barberId, barberId),
        eq(weeklyTakings.weekEnding, weekEnding),
      ),
    )

  if (wk) {
    const total = Number(wk.total)
    let cash = Number(wk.cash)
    let card = Number(wk.card)
    const tips = Number(wk.tips ?? 0)
    const unconfirmedNoShows = Number(wk.unconfirmedNoShows ?? 0)
    // Older/weekly-only rows may store just the total with no split — treat the
    // whole amount as cash so RTB + flags still compute sensibly.
    if (cash + card === 0 && total > 0) cash = total
    if (total > 0 || cash + card > 0 || tips > 0 || unconfirmedNoShows > 0) {
      return {
        cash,
        card,
        total: total > 0 ? total : cash + card,
        tips,
        unconfirmedNoShows,
        daysEntered: 0,
        source: "weekly",
      }
    }
  }

  return {
    cash: 0,
    card: 0,
    total: 0,
    tips: 0,
    unconfirmedNoShows: 0,
    daysEntered: 0,
    source: "none",
  }
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

// ---------------------------------------------------------------------------
// Per-haircut line entries
// ---------------------------------------------------------------------------
// A barber adds a line as each cut is paid. The day's lines are summed (by
// method) into the daily_takings row via recordDailyTakings, which recomputes
// the weekly rollup + RTB. So line entries are the capture layer; the daily +
// weekly + RTB chain below is unchanged.

/** All of a barber's line entries for one date, newest first. */
export async function getBarberLinesForDate(
  barberId: number,
  date: string,
): Promise<TakingsLine[]> {
  const rows = await db
    .select()
    .from(takingsLineEntries)
    .where(
      and(
        eq(takingsLineEntries.barberId, barberId),
        eq(takingsLineEntries.date, date),
      ),
    )
    .orderBy(desc(takingsLineEntries.createdAt), desc(takingsLineEntries.id))
  return rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    method: r.method === "card" ? "card" : "cash",
    kind: (r.kind === "no_show" || r.kind === "tip" ? r.kind : "cut") as TakingsKind,
    noShowPaid: r.noShowPaid ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }))
}

/**
 * Re-sum a barber's line entries for a date into daily_takings, which
 * recomputes the weekly rollup + RTB. Lines are bucketed by kind:
 *  - cut            -> cash/card revenue (by method)
 *  - no_show + paid -> card/cash revenue (auto-charged; counts as normal takings)
 *  - no_show (else) -> unconfirmed no-shows (logged only, NOT revenue)
 *  - tip            -> tips (100% barber, no split/RTB)
 */
export async function recomputeDailyFromLines(
  barberId: number,
  siteId: number,
  date: string,
  enteredByUserId?: string | null,
) {
  const rows = await db
    .select({
      amount: takingsLineEntries.amount,
      method: takingsLineEntries.method,
      kind: takingsLineEntries.kind,
      noShowPaid: takingsLineEntries.noShowPaid,
    })
    .from(takingsLineEntries)
    .where(
      and(
        eq(takingsLineEntries.barberId, barberId),
        eq(takingsLineEntries.date, date),
      ),
    )

  let cash = 0
  let card = 0
  let tips = 0
  let unconfirmedNoShows = 0
  for (const r of rows) {
    const amount = Number(r.amount)
    if (r.kind === "tip") {
      tips += amount
    } else if (r.kind === "no_show") {
      if (r.noShowPaid === true) {
        // Confirmed paid — auto-charge defaults to card.
        if (r.method === "cash") cash += amount
        else card += amount
      } else {
        unconfirmedNoShows += amount
      }
    } else {
      // Normal cut.
      if (r.method === "card") card += amount
      else cash += amount
    }
  }

  return recordDailyTakings({
    barberId,
    siteId,
    date,
    cash,
    card,
    tips,
    unconfirmedNoShows,
    enteredByUserId: enteredByUserId ?? null,
    source: "line-entries",
  })
}

/**
 * Add one line (cut, no-show or tip) and refresh the day + week rollup.
 * No-shows default to CARD (auto-charge) and start unconfirmed (noShowPaid
 * null) until the manager decides at weekly sign-off. Tips carry no method.
 */
export async function addTakingsLineEntry(args: {
  barberId: number
  siteId: number
  date: string
  amount: number
  method?: TakingsMethod
  kind?: TakingsKind
  enteredByUserId?: string | null
}) {
  const amount = Math.max(0, Number(args.amount) || 0)
  if (amount <= 0) return null
  const kind: TakingsKind =
    args.kind === "no_show" || args.kind === "tip" ? args.kind : "cut"
  // No-shows are auto-charged to card by default; cuts use the chosen method;
  // tips are barber cash-in-hand (method is irrelevant but stored as cash).
  const method: TakingsMethod =
    kind === "no_show" ? (args.method === "cash" ? "cash" : "card") : args.method === "card" ? "card" : "cash"
  await db.insert(takingsLineEntries).values({
    barberId: args.barberId,
    siteId: args.siteId,
    date: args.date,
    amount: String(amount),
    method,
    kind,
    noShowPaid: null,
    enteredByUserId: args.enteredByUserId ?? null,
  })
  await recomputeDailyFromLines(args.barberId, args.siteId, args.date, args.enteredByUserId)
  return { ok: true }
}

/**
 * Manager's weekly sign-off decision on a barber's no-shows: mark ALL of that
 * barber's no-show lines for the week paid (→ card revenue + normal split) or
 * not paid (→ £0). Recomputes each affected day so the weekly rollup + RTB
 * reflect the decision. Returns the number of no-show lines updated.
 */
export async function setBarberNoShowsPaid(args: {
  barberId: number
  weekEnding: string
  paid: boolean
}): Promise<number> {
  const dates = weekDates(args.weekEnding)
  const rows = await db
    .select({ id: takingsLineEntries.id, date: takingsLineEntries.date, siteId: takingsLineEntries.siteId })
    .from(takingsLineEntries)
    .where(
      and(
        eq(takingsLineEntries.barberId, args.barberId),
        eq(takingsLineEntries.kind, "no_show"),
        gte(takingsLineEntries.date, dates[0]),
        lte(takingsLineEntries.date, dates[6]),
      ),
    )
  if (rows.length === 0) return 0
  await db
    .update(takingsLineEntries)
    .set({ noShowPaid: args.paid })
    .where(
      and(
        eq(takingsLineEntries.barberId, args.barberId),
        eq(takingsLineEntries.kind, "no_show"),
        gte(takingsLineEntries.date, dates[0]),
        lte(takingsLineEntries.date, dates[6]),
      ),
    )
  // Recompute each distinct affected day.
  const days = Array.from(new Set(rows.map((r) => String(r.date))))
  const siteId = rows[0].siteId
  for (const d of days) {
    await recomputeDailyFromLines(args.barberId, siteId, d)
  }
  return rows.length
}

/** Delete one of a barber's cuts (only their own) and refresh the rollup. */
export async function deleteTakingsLineEntry(args: {
  id: number
  barberId: number
  siteId: number
}) {
  const [row] = await db
    .select()
    .from(takingsLineEntries)
    .where(
      and(
        eq(takingsLineEntries.id, args.id),
        eq(takingsLineEntries.barberId, args.barberId),
      ),
    )
  if (!row) return null
  await db.delete(takingsLineEntries).where(eq(takingsLineEntries.id, args.id))
  await recomputeDailyFromLines(args.barberId, args.siteId, String(row.date), row.enteredByUserId)
  return { date: String(row.date) }
}
