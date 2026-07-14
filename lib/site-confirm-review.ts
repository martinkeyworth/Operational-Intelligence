import "server-only"
import { db } from "@/lib/db"
import { barbers, siteConfirmations } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { computeRtb } from "@/lib/rtb"
import { getBarberDailyWeek } from "@/lib/daily-takings"
import {
  getBarberDiscrepancies,
  type Discrepancy,
} from "@/lib/discrepancies"

export type DiscrepancyDecision = "accepted" | "refused"
export type DiscrepancyState = Record<string, Record<string, DiscrepancyDecision>>

export type BarberRtbReview = {
  barberId: number
  name: string
  cash: number
  card: number
  total: number
  cashRent: number
  cardRent: number
  totalRent: number
  cardCap: number
  days: number
  flags: Discrepancy[]
}

export type SiteConfirmReview = {
  barbers: BarberRtbReview[]
  totalTakings: number
  totalRtb: number
  flagCount: number
  savedDecisions: DiscrepancyState | null
}

/**
 * Build the per-barber computed RTB + discrepancy review the confirm dialog
 * shows for a site's week. Reuses the RTB engine + discrepancy detector, and
 * surfaces any accept/refuse decisions already saved on the confirmation row.
 */
export async function getSiteConfirmReview(
  siteId: number,
  weekEnding: string,
): Promise<SiteConfirmReview> {
  const roster = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.siteId, siteId), eq(barbers.active, true)))

  const rows: BarberRtbReview[] = []
  for (const b of roster) {
    const days = await getBarberDailyWeek(b.id, weekEnding)
    const cash = days.reduce((s, d) => s + d.cash, 0)
    const card = days.reduce((s, d) => s + d.card, 0)
    const daysEntered = days.filter((d) => d.cash > 0 || d.card > 0).length
    const rtb = computeRtb({
      cash,
      card,
      barberPct: b.barberPct == null ? null : Number(b.barberPct),
      cardCap: b.cardRtbCap == null ? null : Number(b.cardRtbCap),
    })
    const flags = await getBarberDiscrepancies(b.id, weekEnding)
    rows.push({
      barberId: b.id,
      name: b.name,
      cash,
      card,
      total: cash + card,
      cashRent: rtb.cashRent,
      cardRent: rtb.cardRent,
      totalRent: rtb.totalRent,
      cardCap: rtb.cardCap,
      days: daysEntered,
      flags,
    })
  }

  const [conf] = await db
    .select({ discrepancyState: siteConfirmations.discrepancyState })
    .from(siteConfirmations)
    .where(
      and(
        eq(siteConfirmations.siteId, siteId),
        eq(siteConfirmations.weekEnding, weekEnding),
      ),
    )

  return {
    barbers: rows,
    totalTakings: rows.reduce((s, r) => s + r.total, 0),
    totalRtb: rows.reduce((s, r) => s + r.totalRent, 0),
    flagCount: rows.reduce((s, r) => s + r.flags.length, 0),
    savedDecisions: (conf?.discrepancyState as DiscrepancyState | null) ?? null,
  }
}
