/**
 * Client-safe communication channel registry (no server-only / DB imports so it
 * can be imported by client components). The server helpers live in lib/comms.ts.
 *
 * Each channel maps to one or more real send points (cron steps, team scheduler
 * functions, or the Google Chat layer). A channel with no row in comm_settings
 * is treated as ENABLED, so the system runs normally until an owner pauses it.
 */
export type CommKey =
  | "weekly-reminders"
  | "board-cadence"
  | "raid-reminders"
  | "raid-ai"
  | "one-to-one"
  | "three-sixty"
  | "google-chat"

export type CommChannel = {
  key: CommKey
  label: string
  description: string
  group: "Weekly report" | "RAID" | "Team (1-2-1 & 360)" | "Channels"
}

export const COMM_CHANNELS: CommChannel[] = [
  {
    key: "weekly-reminders",
    label: "Weekly data-entry reminder",
    description:
      "Saturday 17:00 nudge asking managers to enter takings, KPIs and actions before the week closes.",
    group: "Weekly report",
  },
  {
    key: "board-cadence",
    label: "Board report & collection cadence",
    description:
      "The whole Saturday-evening to Monday cadence: chasing outstanding confirmations/KPIs, the COO narrative and CEO response requests, the RTB summary, and the final board report.",
    group: "Weekly report",
  },
  {
    key: "raid-reminders",
    label: "RAID action reminders",
    description:
      "Daily reminders to owners of open red RAID actions, plus the daily auto-escalation of stalled actions.",
    group: "RAID",
  },
  {
    key: "raid-ai",
    label: "RAID-AI coaching",
    description:
      "Monday AI analysis that spots systemic issues per area and emails the accountable owner a coaching note with a draft plan.",
    group: "RAID",
  },
  {
    key: "one-to-one",
    label: "1-2-1 reminders",
    description:
      "Reminders that a 1-2-1 is due soon and escalation when a 1-2-1 becomes overdue.",
    group: "Team (1-2-1 & 360)",
  },
  {
    key: "three-sixty",
    label: "360 reviewer chasers",
    description:
      "Daily nudges to nominated 360 reviewers who haven't responded yet, until they respond or the cycle closes.",
    group: "Team (1-2-1 & 360)",
  },
  {
    key: "google-chat",
    label: "Google Chat messages",
    description:
      "All Google Chat posts and direct messages across every space (updates, chases, escalations). Emails are unaffected by this toggle.",
    group: "Channels",
  },
]
