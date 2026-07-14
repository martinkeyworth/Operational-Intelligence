import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { ensureBarberForUser } from "@/lib/team"
import {
  recordDailyTakings,
  getBarberDailyWeek,
} from "@/lib/daily-takings"
import { weekEndingFor, currentWeekEnding } from "@/lib/format"

// Ingestion endpoint for the separate daily-entry app. Each request is
// authenticated as the barber (Better Auth session — both apps share the same
// DATABASE_URL + BETTER_AUTH_SECRET). We ALWAYS resolve the barber from the
// authenticated session, never from a client-supplied identity.

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  })
}

async function resolveBarber(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return null
  // Links/creates the operational barber record for this login (by name match
  // or self-provision) — the same helper the in-app team area uses.
  const barber = await ensureBarberForUser({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  })
  return { session, barber }
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"))
  const resolved = await resolveBarber(req)
  if (!resolved) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: cors })
  }
  const { session, barber } = resolved

  let body: { date?: string; cash?: number | string; card?: number | string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: cors })
  }

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
    enteredByUserId: session.user.id,
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
  const resolved = await resolveBarber(req)
  if (!resolved) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: cors })
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
