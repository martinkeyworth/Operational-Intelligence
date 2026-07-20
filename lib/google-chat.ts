import "server-only"
import { google, type chat_v1 } from "googleapis"
import { isOutboundHold } from "@/lib/outbound-hold"

/**
 * Google Chat integration for the weekly submission chase.
 *
 * TWO delivery modes — the caller doesn't care which is active:
 *
 *  A) WEBHOOK (easy, preferred, zero admin setup). If GOOGLE_CHAT_WEBHOOK_URL
 *     is set, every message is POSTed as a card to that one Chat space's
 *     incoming webhook. Setup = create a webhook in a Google Chat space
 *     (Apps & integrations → Webhooks) and paste the URL — no Google Cloud
 *     project, no service account, no delegation scopes, no domain limit. Each
 *     card names who it's for, so a shared "Weekly Submissions" space works for
 *     the whole team (including gmail/hotmail managers).
 *
 *  B) PER-PERSON DM (advanced). If no webhook is set but the service account +
 *     GOOGLE_CHAT_ENABLED are, it privately DMs each in-domain person (see auth
 *     model below). Requires the Workspace admin setup.
 *
 * Both run ALONGSIDE the chase emails and NEVER block or throw into the email
 * path — any missing config / error returns { ok:false, reason }.
 *
 * ---- Per-person DM auth model (mode B only) ----
 *
 * Auth model:
 *  - APP auth (service account, scope chat.bot, NO subject) is used to read the
 *    DM space and post the message as the Chat app.
 *  - USER-DELEGATED auth (subject = recipient, scope chat.spaces) is used only
 *    to OPEN a DM space that doesn't exist yet (spaces.setup).
 *  - DIRECTORY auth (subject = impersonate user, scope admin.directory.user
 *    .readonly) resolves an email to the numeric user id the Chat API requires
 *    under app auth (email aliases only work under user auth).
 *
 * Everything degrades gracefully: any missing config / scope / out-of-domain
 * recipient / API error simply returns { ok:false, reason } and the caller
 * carries on with email. Chat NEVER blocks or throws into the email path.
 *
 * Required env (in addition to the shared GOOGLE_SERVICE_ACCOUNT_* +
 * GOOGLE_IMPERSONATE_EMAIL already used by the calendar):
 *  - GOOGLE_CHAT_ENABLED     "true" to turn the integration on
 *  - GOOGLE_WORKSPACE_DOMAIN e.g. "lessthanzerobarbers.com" — only addresses on
 *                            this domain can receive a Chat DM.
 *
 * Admin one-time setup (Google Workspace):
 *  - Enable the Google Chat API in the same GCP project as the calendar SA.
 *  - Configure a Chat app (status LIVE, "Receive 1:1 messages" on).
 *  - Add these scopes to the service account's domain-wide delegation:
 *      https://www.googleapis.com/auth/chat.bot
 *      https://www.googleapis.com/auth/chat.spaces
 *      https://www.googleapis.com/auth/admin.directory.user.readonly
 */

const APP_SCOPES = ["https://www.googleapis.com/auth/chat.bot"]
const SPACES_SCOPES = ["https://www.googleapis.com/auth/chat.spaces"]
const DIRECTORY_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
]

/** The easy path: an incoming-webhook URL for a single Chat space. */
function chatWebhookUrl(): string {
  return (process.env.GOOGLE_CHAT_WEBHOOK_URL || "").trim()
}

/**
 * Per-space incoming-webhook routing. Each functional Chat space has its own
 * webhook URL in its own env var, so chases/escalations/updates land in the
 * space that owns them. All separate from GOOGLE_CHAT_WEBHOOK_URL (the
 * weekly-confirmation Ops-bot space, left untouched).
 */
export type ChatSpace =
  | "operations"
  | "training"
  | "hr"
  | "marketing"
  | "executive"

const SPACE_ENV: Record<ChatSpace, string> = {
  operations: "GOOGLE_CHAT_WEBHOOK_OPERATIONS",
  training: "GOOGLE_CHAT_WEBHOOK_TRAINING",
  hr: "GOOGLE_CHAT_WEBHOOK_HR",
  marketing: "GOOGLE_CHAT_WEBHOOK_MARKETING",
  executive: "GOOGLE_CHAT_WEBHOOK_EXECUTIVE",
}

function spaceWebhookUrl(space: ChatSpace): string {
  return (process.env[SPACE_ENV[space]] || "").trim()
}

/**
 * Map a canonical functional-area key onto the Chat space that owns it.
 * Operational areas share the Operations space; Strategy rolls up to Executive.
 */
export function spaceForArea(areaKey: string): ChatSpace {
  switch (areaKey) {
    case "Training":
      return "training"
    case "HR":
      return "hr"
    case "Marketing":
      return "marketing"
    case "Strategy":
      return "executive"
    // Capacity, RTB, Subletting and anything else operational.
    default:
      return "operations"
  }
}

/** True when at least one per-space webhook is configured. */
export function isSpaceChatConfigured(): boolean {
  return (Object.keys(SPACE_ENV) as ChatSpace[]).some((s) => spaceWebhookUrl(s))
}

/**
 * Leadership/area Chat is only mirrored for @lessthanzerobarbers.com people —
 * the spaces are in-domain, so a chase to a gmail/hotmail branch manager stays
 * email-only.
 */
export function isLtzLeadershipEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@lessthanzerobarbers.com")
}

/** True when EITHER delivery mode is usable. */
export function isChatConfigured(): boolean {
  if (chatWebhookUrl()) return true
  return Boolean(
    process.env.GOOGLE_CHAT_ENABLED &&
      process.env.GOOGLE_CHAT_ENABLED.toLowerCase() === "true" &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
      process.env.GOOGLE_IMPERSONATE_EMAIL &&
      workspaceDomain(),
  )
}

function workspaceDomain(): string {
  return (process.env.GOOGLE_WORKSPACE_DOMAIN || "").trim().toLowerCase()
}

/** Only Workspace-domain users can receive a Chat DM. */
export function isChatEligible(email: string): boolean {
  const domain = workspaceDomain()
  if (!domain) return false
  return email.trim().toLowerCase().endsWith(`@${domain}`)
}

function normalizeKey(raw: string): string {
  let key = raw.trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1)
  }
  return key.replace(/\\n/g, "\n")
}

function jwt(scopes: string[], subject?: string) {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: normalizeKey(process.env.GOOGLE_SERVICE_ACCOUNT_KEY as string),
    scopes,
    ...(subject ? { subject } : {}),
  })
}

let _appChat: chat_v1.Chat | null = null
/** App-auth Chat client (acts as the Chat app itself). Memoized. */
function appChatClient(): chat_v1.Chat {
  if (_appChat) return _appChat
  _appChat = google.chat({ version: "v1", auth: jwt(APP_SCOPES) })
  return _appChat
}

/**
 * Resolve a Workspace email to the numeric user id the Chat API needs under app
 * auth. Uses the Directory API impersonating GOOGLE_IMPERSONATE_EMAIL. Returns
 * null if the directory scope isn't granted or the user isn't found.
 */
async function resolveUserId(email: string): Promise<string | null> {
  try {
    const admin = google.admin({
      version: "directory_v1",
      auth: jwt(DIRECTORY_SCOPES, process.env.GOOGLE_IMPERSONATE_EMAIL),
    })
    const res = await admin.users.get({ userKey: email })
    return (res.data.id as string) || null
  } catch {
    return null
  }
}

/**
 * Find (or open) the 1:1 DM space between the Chat app and a user.
 * Returns the space resource name (e.g. "spaces/AAAA") or null.
 */
async function resolveDmSpace(email: string): Promise<string | null> {
  const userId = await resolveUserId(email)
  if (!userId) return null

  const app = appChatClient()

  // 1) Existing DM?
  try {
    const found = await app.spaces.findDirectMessage({
      name: `users/${userId}`,
    })
    if (found.data.name) return found.data.name
  } catch {
    // 404 (no DM yet) or permission — fall through to setup.
  }

  // 2) Open one on the user's behalf (needs chat.spaces delegation).
  try {
    const delegated = google.chat({
      version: "v1",
      auth: jwt(SPACES_SCOPES, email),
    })
    const created = await delegated.spaces.setup({
      requestBody: {
        space: { spaceType: "DIRECT_MESSAGE", singleUserBotDm: true },
      },
    })
    return created.data.name ?? null
  } catch {
    return null
  }
}

export type ChatDmResult = { ok: boolean; reason?: string }

export type ChatDmArgs = {
  /** Card header line. */
  title: string
  /** Intro sentence under the header. */
  intro: string
  /** Bullet lines (e.g. each outstanding item + status). */
  lines: string[]
  /** Primary button. */
  button?: { text: string; url: string }
  /** Accent + banner: red (urgent) / green (all-clear) / blue (neutral update). */
  tone?: "urgent" | "positive" | "info"
  /**
   * If set (and the person's numeric Chat id can be resolved), the message will
   * @-mention this person in the space so they get a personal notification.
   * Resolution is best-effort; if it fails the card still posts (no mention).
   */
  mentionEmail?: string
}

/**
 * Resolve an email to the numeric Chat user id used by `<users/{id}>` mentions.
 * Order: (1) a manual JSON map in GOOGLE_CHAT_USER_IDS (zero Google setup),
 * then (2) the Directory API (needs the admin.directory.user.readonly scope on
 * the existing service account's domain-wide delegation). Returns null if
 * neither is available — the caller then posts without a mention.
 */
async function resolveMentionId(email: string): Promise<string | null> {
  const key = email.trim().toLowerCase()
  const raw = (process.env.GOOGLE_CHAT_USER_IDS || "").trim()
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>
      for (const [k, v] of Object.entries(map)) {
        if (k.trim().toLowerCase() === key && v) return String(v).trim()
      }
    } catch {
      console.log("[v0] GOOGLE_CHAT_USER_IDS is not valid JSON — ignoring")
    }
  }
  return resolveUserId(email)
}

/**
 * Build the cardsV2 payload shared by both delivery modes. When `forLabel` is
 * given (webhook mode → shared space), it's shown under the header so everyone
 * can see who the message is for. When `mentionUserId` is given, a top-level
 * text field @-mentions the person (that's what triggers the notification).
 */
function buildCardMessage(
  args: ChatDmArgs,
  forLabel?: string,
  mentionUserId?: string | null,
): chat_v1.Schema$Message {
  const accent =
    args.tone === "positive"
      ? "#16a34a"
      : args.tone === "info"
        ? "#2563eb"
        : "#b91c1c"
  const banner =
    args.tone === "positive"
      ? "All clear"
      : args.tone === "info"
        ? "Update"
        : "Action needed"
  const widgets: chat_v1.Schema$GoogleAppsCardV1Widget[] = [
    {
      decoratedText: {
        text: `<font color="${accent}"><b>${banner}</b></font>`,
      },
    },
    ...(forLabel
      ? [{ decoratedText: { topLabel: "For", text: forLabel } }]
      : []),
    { textParagraph: { text: args.intro } },
    ...args.lines.map((t) => ({ textParagraph: { text: `• ${t}` } })),
  ]
  if (args.button) {
    widgets.push({
      buttonList: {
        buttons: [
          {
            text: args.button.text,
            onClick: { openLink: { url: args.button.url } },
          },
        ],
      },
    })
  }
  return {
    // A top-level text field is what renders an actual @-mention notification;
    // card widgets alone don't. Only included when we resolved a numeric id.
    ...(mentionUserId ? { text: `<users/${mentionUserId}>` } : {}),
    cardsV2: [
      {
        cardId: "ltz-weekly-chase",
        card: {
          header: { title: args.title, imageType: "CIRCLE" },
          sections: [{ widgets }],
        },
      },
    ],
  }
}

/** POST a card to the single-space incoming webhook (easy mode). */
async function sendViaWebhook(
  args: ChatDmArgs,
  forLabel?: string,
): Promise<ChatDmResult> {
  try {
    const mentionId = args.mentionEmail
      ? await resolveMentionId(args.mentionEmail)
      : null
    const res = await fetch(chatWebhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(buildCardMessage(args, forLabel, mentionId)),
    })
    if (!res.ok) {
      console.log("[v0] chat webhook non-2xx:", res.status)
      return { ok: false, reason: "webhook-error" }
    }
    return { ok: true }
  } catch (err) {
    console.log(
      "[v0] chat webhook failed:",
      err instanceof Error ? err.message : String(err),
    )
    return { ok: false, reason: "error" }
  }
}

/**
 * Send a Chat card for one person. Prefers the easy webhook mode (posts to a
 * shared space, labelled with the person's name); otherwise falls back to a
 * private per-person DM. Best-effort: returns { ok:false, reason } (never
 * throws) so the caller's email path is unaffected.
 */
export async function sendChatDm(
  email: string,
  args: ChatDmArgs,
): Promise<ChatDmResult> {
  try {
    if (isOutboundHold()) return { ok: false, reason: "on-hold" }
    if (!isChatConfigured()) return { ok: false, reason: "not-configured" }

    // Easy mode: one shared-space webhook, no domain limit.
    if (chatWebhookUrl()) return sendViaWebhook(args, email)

    // Advanced mode: private DM, in-domain only.
    if (!isChatEligible(email)) return { ok: false, reason: "out-of-domain" }
    const space = await resolveDmSpace(email)
    if (!space) return { ok: false, reason: "no-dm" }

    await appChatClient().spaces.messages.create({
      parent: space,
      requestBody: buildCardMessage(args),
    })
    return { ok: true }
  } catch (err) {
    console.log(
      "[v0] sendChatDm failed:",
      err instanceof Error ? err.message : String(err),
    )
    return { ok: false, reason: "error" }
  }
}

/**
 * Post a card to a specific functional Chat space's incoming webhook. `forLabel`
 * (e.g. the person's name) is shown under the header so a shared space can carry
 * per-person chases. Best-effort: returns { ok:false, reason } and NEVER throws,
 * so the caller's email path is unaffected.
 */
export async function sendSpaceChat(
  space: ChatSpace,
  args: ChatDmArgs,
  forLabel?: string,
): Promise<ChatDmResult> {
  if (isOutboundHold()) return { ok: false, reason: "on-hold" }
  const url = spaceWebhookUrl(space)
  if (!url) return { ok: false, reason: "not-configured" }
  try {
    const mentionId = args.mentionEmail
      ? await resolveMentionId(args.mentionEmail)
      : null
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(buildCardMessage(args, forLabel, mentionId)),
    })
    if (!res.ok) {
      console.log(`[v0] ${space} chat webhook non-2xx:`, res.status)
      return { ok: false, reason: "webhook-error" }
    }
    return { ok: true }
  } catch (err) {
    console.log(
      `[v0] ${space} chat webhook failed:`,
      err instanceof Error ? err.message : String(err),
    )
    return { ok: false, reason: "error" }
  }
}

/** Convenience: post to the space that owns a functional area. */
export async function sendAreaChat(
  areaKey: string,
  args: ChatDmArgs,
  forLabel?: string,
): Promise<ChatDmResult> {
  return sendSpaceChat(spaceForArea(areaKey), args, forLabel)
}
