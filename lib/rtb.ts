// RTB (Ready-To-Bank / house rent) engine. Pure + unit-testable — no db imports.
//
// Replaces the old paper "tally then divide by your cut" step. Given a barber's
// weekly cash + card totals, their profit-split %, and their per-week card-RTB
// cap, it computes how much house rent to take from cash vs card while keeping
// the overall business % split intact.
//
// Rules (locked with the user):
//  - The overall business % of total takings is always the rent owed.
//  - Card rent is capped per barber per week (default £200). We take rent from
//    card first up to the cap, then the remainder from cash — this drives the
//    bankable cash rent higher, which is the point of the cap.
//  - If cash can't cover its remainder, the shortfall goes BACK onto card (the
//    cap is only ever broken when unavoidable), and we flag it.

import { effectiveBarberPct } from "@/lib/split-config"

export type RtbInput = {
  /** Cash takings for the period. */
  cash: number
  /** Card takings for the period. */
  card: number
  /** Barber's % share (whole number 0-100). Null → group default. */
  barberPct: number | null | undefined
  /** Max rent taken from card this period (default 200). */
  cardCap?: number | null
}

export type RtbResult = {
  /** Rent taken from cash. */
  cashRent: number
  /** Rent taken from card. */
  cardRent: number
  /** Total house rent (business % of total takings). */
  totalRent: number
  /** The effective card cap used. */
  cardCap: number
  /** True if the card cap constrained how much rent came from card. */
  cappedCard: boolean
  /**
   * Amount of rent the cap pushed off card that cash could NOT cover, so it was
   * forced back onto card (cap broken). 0 when the split worked cleanly.
   */
  cardOverflow: number
}

const DEFAULT_CARD_CAP = 200

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Compute the RTB (house rent) split for a barber's period takings.
 * Guarantees `cashRent + cardRent === totalRent` (to 2dp).
 */
export function computeRtb(input: RtbInput): RtbResult {
  const cash = Math.max(0, Number(input.cash) || 0)
  const card = Math.max(0, Number(input.card) || 0)
  const cardCap = Math.max(
    0,
    input.cardCap == null ? DEFAULT_CARD_CAP : Number(input.cardCap) || 0,
  )

  const businessFraction = (100 - effectiveBarberPct(input.barberPct)) / 100
  const totalRent = round2((cash + card) * businessFraction)

  // 1. Take rent from card first, but no more than the cap or the card taken.
  let cardRent = Math.min(totalRent, cardCap, card)
  const cappedCard = totalRent > cardRent && cardRent === cardCap && cardCap < card

  // 2. Remainder comes from cash.
  const remainder = round2(totalRent - cardRent)
  const cashRent = Math.min(remainder, cash)

  // 3. If cash can't cover its remainder, push the shortfall back onto card
  //    (cap broken only when unavoidable).
  const cardOverflow = round2(Math.max(0, remainder - cashRent))
  cardRent = round2(cardRent + cardOverflow)

  return {
    cashRent: round2(cashRent),
    cardRent,
    totalRent,
    cardCap,
    cappedCard,
    cardOverflow,
  }
}
