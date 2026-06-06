// Profit-split configuration. Client-safe (no db imports).

// Default barber % share when a barber's split has not yet been set in the
// secure Split area. Business takes the remainder.
export const DEFAULT_BARBER_PCT = 60

/** Resolve a barber's effective % (falls back to the group default). */
export function effectiveBarberPct(barberPct: number | null | undefined): number {
  return barberPct == null ? DEFAULT_BARBER_PCT : barberPct
}

/** Business % is simply the remainder of the barber %. */
export function businessPct(barberPct: number | null | undefined): number {
  return 100 - effectiveBarberPct(barberPct)
}
