# Daily Takings Ingest — contract for the separate entry app

The daily cash/card entry screen lives in a **separate v0 app**. It pushes each
barber's daily figures into this (leadership) app, which tallies them into the
weekly rollup, computes RTB, and surfaces discrepancies at the manager's weekly
confirmation.

Endpoint (this app): `POST /api/ingest/daily-takings`
Read-back:            `GET  /api/ingest/daily-takings?week=yyyy-mm-dd`

## Shared prerequisites

Both apps MUST share:

- **`DATABASE_URL`** — the same Neon database (so barbers, sites and the
  `daily_takings` / `weekly_takings` tables are one source of truth).
- **`BETTER_AUTH_SECRET`** — the same value, so a barber's email + password
  login is identical in both apps.

Barbers sign in with **email + password** (the accounts already in this app's
`user` table). No new account system.

## Authentication — pick ONE mode

### Mode 1 — per-barber session (same registrable domain only)

If the entry app is hosted on the **same registrable domain** (e.g.
`entry.lessthanzerobarbers.com` alongside `app.lessthanzerobarbers.com`), the
Better Auth session cookie is sent automatically. The entry app's browser can
`fetch` this endpoint with `credentials: "include"`, and the barber is taken
from the session. Add the entry app's origin to **`INGEST_ALLOWED_ORIGINS`**
(comma-separated) in this app.

> Cross-*site* cookies (different registrable domains, e.g. two `*.vercel.app`
> subdomains) are blocked by browsers. Use Mode 2 for that.

### Mode 2 — server-to-server shared secret (robust, any domain) — recommended

The entry app authenticates the barber **on its own server** (same shared user
table), then its server calls this endpoint:

```
POST /api/ingest/daily-takings
Headers:
  Content-Type: application/json
  x-ingest-key: <INGEST_API_KEY>          # same secret set in BOTH apps
Body:
  { "email": "barber@example.com", "date": "2026-07-13", "cash": 240, "card": 310 }
```

Set **`INGEST_API_KEY`** (a long random string) in this app's env. The entry
app's server sends the same value in `x-ingest-key`. The barber is resolved from
`email`; the secret authorises the call. Never expose `INGEST_API_KEY` to the
browser — call this from the entry app's server action / route handler only.

## Request body (POST)

| Field   | Type              | Notes                                          |
| ------- | ----------------- | ---------------------------------------------- |
| `date`  | string `yyyy-mm-dd` | The day being logged. Cannot be in the future. |
| `cash`  | number            | Day's cash total (£). Non-negative.            |
| `card`  | number            | Day's card total (£). Non-negative.            |
| `email` | string            | **Mode 2 only** — which barber. Ignored in Mode 1 (session wins). |

One row = **one barber, one day**. Re-posting the same `date` **updates** that
day (idempotent upsert), so a correction just re-sends.

## Response (POST)

```json
{
  "ok": true,
  "barber":     { "id": 2, "name": "Mario", "siteId": 1 },
  "day":        { "date": "2026-07-13", "cash": 240, "card": 310 },
  "weekEnding": "2026-07-18",
  "weekToDate": { "cash": 980, "card": 1120, "cashRent": 640, "cardRent": 200, "totalRent": 840 }
}
```

`weekToDate` is the recomputed weekly rollup (including RTB) after this day was
recorded — handy to show the barber their running week + RTB.

## What this app does on receipt

1. Upserts the day into `daily_takings` (unique on `barber_id, date`).
2. Recomputes that barber's `weekly_takings` rollup for the week the date falls
   in (Sun→Sat, week ending Saturday) and writes cash/card + RTB from the split.
3. RTB uses the barber's split (`barber_pct`) and per-barber card cap
   (`card_rtb_cap`, default £200): card rent is capped, the remainder goes to
   cash, and only overflows back to card if cash can't cover it.

The manager then reviews the computed RTB + any discrepancy flags inside the
existing **weekly site confirmation** and accepts/refuses each flag before
confirming. No separate per-barber confirm step.

## Env summary (this app)

| Var                     | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`          | Shared Neon DB (same in both apps).                          |
| `BETTER_AUTH_SECRET`    | Shared auth secret (same in both apps).                      |
| `INGEST_API_KEY`        | Mode 2 shared secret. Set in both apps; sent as `x-ingest-key`. |
| `INGEST_ALLOWED_ORIGINS`| Mode 1 CORS allowlist (comma-separated origins).             |
