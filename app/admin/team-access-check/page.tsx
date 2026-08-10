import Link from "next/link"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { barbers as barbersTable, user as userTable } from "@/lib/db/schema"
import { resolveBarberForUser } from "@/lib/team"
import { isLeadershipHolidayEmail, OWNER_EMAILS } from "@/lib/access-types"
import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"

export const dynamic = "force-dynamic"

// UNBREAKABLE diagnostic for the Team Area access problem.
//
// CRITICAL: this page reads the raw auth session DIRECTLY (auth.api.getSession)
// and NEVER goes through requireUser / getAccessUser. That matters because
// getAccessUser returns null (→ requireUser redirects to /sign-in) whenever the
// session's user id has no matching `user` table row — which would make this
// page bounce just like every other protected page. Reading the session
// directly lets us SEE that exact situation instead of being redirected by it.
//
// Every DB call is wrapped so the page can never crash; it always renders.
export default async function TeamAccessCheckPage() {
  const session = await safeAsync(async () => {
    const h = await headers()
    return auth.api.getSession({ headers: h })
  }, null)
  const sUser = session?.user ?? null
  const sessionId = sUser?.id ?? null
  const email = (sUser?.email ?? "").trim()
  const emailLower = email.toLowerCase()
  const sessionName = (sUser?.name ?? "").trim()

  // Not signed in at all — say so plainly, do NOT redirect.
  if (!sUser) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8 md:px-8">
        <h1 className="mb-3 text-2xl font-semibold text-foreground">
          Team Area access check
        </h1>
        <Card className="border-red-500/50 p-5">
          <p className="text-sm text-red-600">
            No active session was found — you are not signed in on this browser.
            Sign in first, then reopen this page.
          </p>
        </Card>
      </main>
    )
  }

  const leadership = safe(() => isLeadershipHolidayEmail(email), false)
  const inOwnerList = OWNER_EMAILS.map((e) => e.toLowerCase()).includes(emailLower)

  // The decisive check: is there a `user` row whose id matches the SESSION id?
  // If not, getAccessUser returns null and EVERY protected page redirects to
  // /sign-in — which looks like "everything is broken / nothing loads".
  const rowById = await safeAsync(async () => {
    const [r] = await db
      .select({ id: userTable.id, email: userTable.email, name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, sessionId!))
    return r ?? null
  }, null)

  // Is there a `user` row with this EMAIL (any id)? A mismatch between this
  // row's id and the session id === a duplicate / re-registered account.
  const rowsByEmail = await safeAsync(async () => {
    if (!emailLower) return []
    return db
      .select({ id: userTable.id, email: userTable.email, name: userTable.name })
      .from(userTable)
  }, [] as { id: string; email: string; name: string }[])
  const emailMatches = rowsByEmail.filter(
    (r) => (r.email ?? "").trim().toLowerCase() === emailLower,
  )

  const allBarbers = await safeAsync(
    () =>
      db
        .select({
          id: barbersTable.id,
          name: barbersTable.name,
          userId: barbersTable.userId,
          active: barbersTable.active,
        })
        .from(barbersTable),
    [] as { id: number; name: string; userId: string | null; active: boolean }[],
  )
  const liveUserIds = await safeAsync(async () => {
    const rows = await db.select({ id: userTable.id }).from(userTable)
    return new Set(rows.map((r) => r.id))
  }, new Set<string>())

  const displayName = (sessionName || email.split("@")[0] || "").trim()
  const firstName = displayName.split(/\s+/)[0]?.toLowerCase() ?? ""
  const nameMatches = allBarbers.filter((b) => {
    const n = b.name.trim().toLowerCase()
    return n === displayName.toLowerCase() || (firstName && n.split(/\s+/)[0] === firstName)
  })

  // Attempt the self-healing resolve (this WRITES) only when the session id has
  // a matching user row — otherwise there is no valid login to link a barber to.
  let resolvedName: string | null = null
  let resolvedId: number | null = null
  let resolveError: string | null = null
  if (rowById) {
    try {
      const r = await resolveBarberForUser({ id: sessionId!, name: sessionName, email })
      if (r) {
        resolvedId = r.id
        resolvedName = r.name
      }
    } catch (e) {
      resolveError = e instanceof Error ? e.message : String(e)
    }
  }

  const sessionRowMismatch = !rowById

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:px-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground text-balance">
          Team Area access check
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Reads the raw sign-in session directly. Whatever state the account is
          in, this page renders the truth below.
        </p>
      </header>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Signed-in session
        </h2>
        <Row label="Session login id" value={sessionId || "(none)"} />
        <Row label="Email (exactly)" value={email || "(no email on session)"} />
        <Row label="Name" value={displayName || "(none)"} />
        <Row label="Recognised as OWNER" value={yesNo(inOwnerList)} />
        <Row label="Recognised as LEADERSHIP" value={yesNo(leadership)} />
        <Row
          label="Has matching account row"
          value={yesNo(Boolean(rowById))}
        />
      </Card>

      {sessionRowMismatch && (
        <Card className="mb-4 border-red-500/60 p-5">
          <h2 className="mb-2 text-sm font-semibold text-red-600">
            This is the problem: no account row matches your session
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Your session id is{" "}
            <span className="font-medium text-foreground break-all">{sessionId}</span>{" "}
            but there is no matching row in the accounts table. When that happens
            the app treats you as signed out and bounces every protected page to
            the sign-in screen — which is exactly what you have been seeing.
            {emailMatches.length > 0 ? (
              <>
                {" "}There {emailMatches.length === 1 ? "is" : "are"}{" "}
                {emailMatches.length} account row(s) with your email under a
                DIFFERENT id (listed below) — you likely registered a second time.
                Sign in with the original account, or I can merge them.
              </>
            ) : (
              <> No account row carries this email at all.</>
            )}
          </p>
        </Card>
      )}

      {emailMatches.length > 0 && (
        <Card className="mb-4 p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Account rows with this email ({emailMatches.length})
          </h2>
          {emailMatches.map((r) => (
            <Row
              key={r.id}
              label={r.name || "(no name)"}
              value={
                r.id === sessionId
                  ? "id matches session ✓"
                  : `id ${r.id} (different from session)`
              }
            />
          ))}
        </Card>
      )}

      <Card
        className={`mb-4 p-5 ${resolvedId ? "border-emerald-500/50" : "border-red-500/50"}`}
      >
        <h2 className="mb-3 text-sm font-semibold text-foreground">Result</h2>
        {!rowById ? (
          <p className="text-sm text-red-600">
            Skipped barber linking because the session has no valid account row
            (see above). Fix the account first.
          </p>
        ) : resolveError ? (
          <p className="text-sm text-red-600 break-all">
            Resolution threw an error: {resolveError}
          </p>
        ) : resolvedId ? (
          <>
            <p className="mb-3 text-sm text-emerald-600">
              Linked to barber #{resolvedId} ({resolvedName}). Team Area should now
              work — open it below.
            </p>
            <Link href="/team" className={buttonVariants({ size: "sm" })}>
              Go to Team Area
            </Link>
          </>
        ) : (
          <p className="text-sm text-red-600">
            No barber record could be linked for this account. See the rows below —
            either no row matches this name, or the matching row is owned by another
            active login.
          </p>
        )}
      </Card>

      <Card className="mb-4 p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Barber rows matching this name ({nameMatches.length})
        </h2>
        {nameMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No barber row matches &ldquo;{displayName || "(none)"}&rdquo;.
          </p>
        ) : (
          nameMatches.map((b) => (
            <Row
              key={b.id}
              label={`#${b.id} ${b.name}${b.active ? "" : " (inactive)"}`}
              value={linkState(b, sessionId, liveUserIds)}
            />
          ))
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          All barbers ({allBarbers.length})
        </h2>
        <div className="max-h-80 overflow-y-auto">
          {allBarbers.map((b) => (
            <Row
              key={b.id}
              label={`#${b.id} ${b.name}${b.active ? "" : " (inactive)"}`}
              value={linkState(b, sessionId, liveUserIds)}
            />
          ))}
        </div>
      </Card>
    </main>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground break-all">{value}</span>
    </div>
  )
}

function yesNo(v: boolean) {
  return v ? "yes" : "no"
}

function linkState(
  b: { userId: string | null },
  currentId: string | null,
  liveUserIds: Set<string>,
) {
  if (b.userId === null) return "unlinked (claimable)"
  if (!liveUserIds.has(b.userId)) return "orphaned login → claimable"
  if (currentId && b.userId === currentId) return "linked to THIS login"
  return "linked to another live login"
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}
