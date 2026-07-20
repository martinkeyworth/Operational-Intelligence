/**
 * Temporary global hold on ALL automated outbound.
 *
 * When the `OUTBOUND_HOLD` env var is truthy ("1", "true", "on", "yes" —
 * case-insensitive), the app pauses:
 *   - the entire weekly reporting cadence + every automated cron step
 *     (collection chasers, confirmation/KPI nudges, RAID escalations,
 *     RAID-AI coaching, team/360 reminders, the board report), and
 *   - every Google Chat post/DM (RAID, functional, RTB, escalations, summaries).
 *
 * It is a temporary switch: flip the env var in project settings to hold or
 * resume instantly — no code change or redeploy of logic required. Genuinely
 * interactive/transactional emails (login, approvals a manager triggers, leave
 * confirmations) are NOT chasers and keep working.
 */
export function isOutboundHold(): boolean {
  const v = (process.env.OUTBOUND_HOLD ?? "").trim().toLowerCase()
  return v === "1" || v === "true" || v === "on" || v === "yes"
}
