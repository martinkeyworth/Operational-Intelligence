import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { ensureBarberForUser } from "@/lib/team"
import {
  recordDailyTakings,
  getBarberDailyWeek,
} from "@/lib/daily-takings"
import { weekEndingFor, currentWeekEnding } from "@/lib/format"

// Ingestion endpoint for the separate daily-entry app. A day's cash/card is
// ALWAYS attributed to a barber the server can trust — never to a raw
// client-supplied identity. Two accepted auth modes:
//
//  1. Per-barber session (Better Auth). Works when the entry app shares this
//     app's registrable domain (cookies are SameSite). Barber = the session
//     user. Both apps must share DATABASE_URL + BETTER_AUTH_SECRET.
//  2. Server-to-server shared secret. The entry app's OWN server (after it has
//     authenticated the barber against the shared user table) posts here with
//     header `x-ingest-key: <INGEST_API_KEY>` and the barber's `email`. This is
//     the robust path across different domains, where third-party cookies fail.

/** Origins allowed to make browser (credentialed) requests. Comma-separated
 *  env var, e.g. "https://entry.example.com,https://foo.vercel.app". */
function allowedOrigins(): string[] {
  return (process.env.INGEST_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-ingest-key",
    Vary: "Origin",
  }
  // Only reflect the origin (and allow credentials) if it is explicitly
  // allowlisted. Never pair "*" with credentials — browsers reject it and it
  // would be a security hole.
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
    headers["Access-Control-Allow-Credentials"] = "true"
  }
  return headers
}

type Resolved = {
  barber: { id: number; name: string; siteId: number }
  enteredByUserId: string | null
}

/** Resolve the barber this request may write for, via secret+email or session.
 *  Returns null when unauthenticated / unresolvable. */
async function resolveBarber(
  req: NextRequest,
  bodyEmail?: string | null,
): Promise<Resolved | null> {
  // Mode 2: server-to-server shared secret.
  const key = req.headers.get("x-ingest-key")
  const configured = process.env.INGEST_API_KEY
  if (configured && key && key === configured) {
    const email = String(bodyEmail ?? "").trim().toLowerCase()
    if (!email) return null
    const [u] = await db.select().from(user).where(eq(user.email, email))
    if (!u) return null
    const barber = await ensureBarberForUser({
      id: u.id,
      name: u.name,
      email: u.email,
    })
    return { barber, enteredByUserId: u.id }
  }

  // Mode 1: per-barber Better Auth session.
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return null
  const barber = await ensureBarberForUser({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  })
  return { barber, enteredByUserId: session.user.id }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  })
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"))

  let body: {
    date?: string
    cash?: number | string
    card?: number | string
    email?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: cors })
  }

  const resolved = await resolveBarber(req, body.email)
  if (!resolved) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: cors },
    )
  }
  const { barber, enteredByUserId } = resolved

  const date = String(body.date ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be yyyy-mm-dd" },
      { status: 400, headers: cors },
    )
  }
  // Reject future dates (compared against the current London-week Saturday).
  if (date > currentWeekEnding()) {
    return NextResponse.json(
      { error: "date cannot be in the future" },
      { status: 400, headers: cors },
    )
  }

  const cash = Number(body.cash ?? 0)
  const card = Number(body.card ?? 0)
  if (!Number.isFinite(cash) || !Number.isFinite(card) || cash < 0 || card < 0) {
    return NextResponse.json(
      { error: "cash and card must be non-negative numbers" },
      { status: 400, headers: cors },
    )
  }

  const result = await recordDailyTakings({
    barberId: barber.id,
    siteId: barber.siteId,
    date,
    cash,
    card,
    enteredByUserId,
  })

  return NextResponse.json(
    {
      ok: true,
      barber: { id: barber.id, name: barber.name, siteId: barber.siteId },
      day: { date: result.date, cash: result.cash, card: result.card },
      weekEnding: result.weekEnding,
      weekToDate: result.rollup,
    },
    { headers: cors },
  )
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"))
  const emailParam = req.nextUrl.searchParams.get("email")
  const resolved = await resolveBarber(req, emailParam)
  if (!resolved) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: cors },
    )
  }
  const { barber } = resolved

  const weekParam = req.nextUrl.searchParams.get("week")
  const weekEnding =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? weekEndingFor(weekParam)
      : currentWeekEnding()

  const days = await getBarberDailyWeek(barber.id, weekEnding)
  return NextResponse.json(
    {
      ok: true,
      barber: { id: barber.id, name: barber.name, siteId: barber.siteId },
      weekEnding,
      days,
    },
    { headers: cors },
  )
}
