// Client-safe discrepancy-detection defaults. Kept separate from
// lib/discrepancies.ts (which is server-only) so client components — e.g. the
// splits admin row — can show the default values as input placeholders.

/** Default ± swing vs trailing average that trips the "big swing" flag, used
 *  when a barber has no per-barber override set. */
export const SWING_THRESHOLD_PCT = 30

/** Default days a barber is expected to have entered for a "full" week, used
 *  when a barber has no per-barber override set. */
export const EXPECTED_WORKING_DAYS = 5
