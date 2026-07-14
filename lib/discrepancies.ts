import "server-only"
import { db } from "@/lib/db"
import { barbers, weeklyTakings } from "@/lib/db/schema"
import { and, asc, eq, lt } from "drizzle-orm"
import { computeRtb } from "@/lib/rtb"
import { getBarberDailyWeek } from "@/lib/daily-takings"
import {
  SWING_THRESHOLD_PCT,
  EXPECTED_WORKING_DAYS,
} from "@/lib/discrepancies-config"

// Detects takings/RTB discrepancies for a barber's week, so the manager can
// accept or refuse each one at confirmation. Pure read (no writes).

// Defaults live in the client-safe lib/discrepancies-config.ts; re-export them
// here so existing server-side importers keep working.
export { SWING_THRESHOLD_PCT, EXPECTED_WORKING_DAYS }

export type DiscrepancyKind = "cash_short" | "swing" | "partial_week" | "missing"

export type Discrepancy = {
  kind: DiscrepancyKind
  severity: "warning" | "critical"
  detail: string
}

export type BarberDiscrepancies = {
  barberId: number
  flags: Discrepancy[]
}

/**
 * Compute discrepancy flags for one barber for a given week-ending.
 * Uses the barber's daily rows (this week), weekly history (trailing avg),
 * profit split + card cap (RTB), and weekly target.
 */
export async function getBarberDiscrepancies(
  barberId: number,
  weekEnding: string,
): Promise<Discrepancy[]> {
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId))
  if (!barber) return []

  // Per-barber thresholds, falling back to the system defaults when unset.
  const swingThreshold =
    barber.swingThresholdPct == null
      ? SWING_THRESHOLD_PCT
      : Number(barber.swingThresholdPct)
  const expectedDays =
    barber.expectedWorkingDays == null
      ? EXPECTED_WORKING_DAYS
      : Number(barber.expectedWorkingDays)

  const days = await getBarberDailyWeek(barberId, weekEnding)
  const cash = days.reduce((s, d) => s + d.cash, 0)
  const card = days.reduce((s, d) => s + d.card, 0)
  const total = cash + card
  const daysEntered = days.filter((d) => d.cash > 0 || d.card > 0).length

  const flags: Discrepancy[] = []

  // 1. Missing / zero — no takings at all this week.
  if (daysEntered === 0 || total === 0) {
    flags.push({
      kind: "missing",
      severity: "critical",
      detail: "No takings entered for this week.",
    })
    // Nothing else is meaningful with no data.
    return flags
  }

  // 2. Partial week — some days entered but fewer than expected.
  if (daysEntered < expectedDays) {
    flags.push({
      kind: "partial_week",
      severity: "warning",
      detail: `Only ${daysEntered} day${daysEntered === 1 ? "" : "s"} entered (expected ${expectedDays}). Days may be missing.`,
    })
  }

  // 3. Cash short of rent owed — after the card cap, cash can't cover the rent
  //    it should, forcing rent back onto card (cap broken).
  const rtb = computeRtb({
    cash,
    card,
    barberPct: barber.barberPct == null ? null : Number(barber.barberPct),
    cardCap: barber.cardRtbCap == null ? null : Number(barber.cardRtbCap),
  })
  if (rtb.cardOverflow > 0) {
    flags.push({
      kind: "cash_short",
      severity: "critical",
      detail: `Cash taken can't cover the rent owed — £${rtb.cardOverflow.toFixed(2)} of RTB had to go back onto card (over the £${rtb.cardCap} cap).`,
    })
  }

  // 4. Big swing vs trailing 4-week average and vs weekly target.
  const prior = await db
    .select({ total: weeklyTakings.total })
    .from(weeklyTakings)
    .where(and(eq(weeklyTakings.barberId, barberId), lt(weeklyTakings.weekEnding, weekEnding)))
    .orderBy(asc(weeklyTakings.weekEnding))
  const recent = prior.slice(-4).map((r) => Number(r.total)).filter((n) => n > 0)
  if (recent.length >= 2) {
    const avg = recent.reduce((s, n) => s + n, 0) / recent.length
    if (avg > 0) {
      const swingPct = ((total - avg) / avg) * 100
      if (Math.abs(swingPct) >= swingThreshold) {
        flags.push({
          kind: "swing",
          severity: "warning",
          detail: `Week total £${total.toFixed(0)} is ${swingPct > 0 ? "up" : "down"} ${Math.abs(swingPct).toFixed(0)}% vs the ${recent.length}-week average (£${avg.toFixed(0)}).`,
        })
      }
    }
  }

  return flags
}

/** Batch helper: discrepancies for many barbers in a week. */
export async function getSiteDiscrepancies(
  barberIds: number[],
  weekEnding: string,
): Promise<BarberDiscrepancies[]> {
  const out: BarberDiscrepancies[] = []
  for (const id of barberIds) {
    out.push({ barberId: id, flags: await getBarberDiscrepancies(id, weekEnding) })
  }
  return out
}
