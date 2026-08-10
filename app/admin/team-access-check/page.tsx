import Link from "next/link"
import { requireUser } from "@/lib/access"
import { db } from "@/lib/db"
import { barbers as barbersTable, user as userTable } from "@/lib/db/schema"
import { resolveBarberForUser } from "@/lib/team"
import { isLeadershipHolidayEmail, OWNER_EMAILS } from "@/lib/access-types"
import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"

export const dynamic = "force-dynamic"

// Diagnostic for the Team Area access problem. Deliberately gated ONLY on being
// signed in (no owner / admin gate) and fully wrapped in try/catch so it can
// NEVER redirect or crash — whatever state the account is in, this page must
// render and show the truth (especially the exact signed-in email). Loading it
// also repairs the barber link for the signed-in user (resolveBarberForUser
// self-heals / provisions for leadership).
export default async function TeamAccessCheckPage() {
  const user = await requireUser()

  const email = (user.email ?? "").trim()
  const emailLower = email.toLowerCase()
  const leadership = safe(() => isLeadershipHolidayEmail(email), false)
  const inOwnerList = OWNER_EMAILS.map((e) => e.toLowerCase()).includes(emailLower)

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

  const displayName = (user.name?.trim() || email.split("@")[0] || "").trim()
  const firstName = displayName.split(/\s+/)[0]?.toLowerCase() ?? ""
  const nameMatches = allBarbers.filter((b) => {
    const n = b.name.trim().toLowerCase()
    return n === displayName.toLowerCase() || (firstName && n.split(/\s+/)[0] === firstName)
  })

  // Resolve (this WRITES: links an unlinked/orphaned row by name, or provisions
  // for leadership) — so simply loading this page repairs the account.
  let resolvedName: string | null = null
  let resolvedId: number | null = null
  let resolveError: string | null = null
  try {
    const r = await resolveBarberForUser({ id: user.id, name: user.name, email })
    if (r) {
      resolvedId = r.id
      resolvedName = r.name
    }
  } catch (e) {
    resolveError = e instanceof Error ? e.message : String(e)
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:px-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground text-balance">
          Team Area access check
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Shows exactly what the system sees for the account you are signed in as,
          and repairs its barber link. Read the values below carefully.
        </p>
      </header>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Signed-in account
        </h2>
        <Row label="Login id" value={user.id} />
        <Row label="Email (exactly)" value={email || "(no email on session)"} />
        <Row label="Name" value={displayName || "(none)"} />
        <Row label="Recognised as OWNER" value={yesNo(inOwnerList)} />
        <Row label="Recognised as LEADERSHIP" value={yesNo(leadership)} />
        <Row label="isOwner (computed)" value={yesNo(Boolean(user.isOwner))} />
        <Row label="canViewDashboard" value={yesNo(Boolean(user.canViewDashboard))} />
        <Row label="isBarber capability" value={yesNo(Boolean(user.isBarber))} />
      </Card>

      {!leadership && (
        <Card className="mb-4 border-amber-500/60 p-5">
          <h2 className="mb-2 text-sm font-semibold text-amber-600">
            This email is NOT in the leadership list
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            The account you are signed in as is{" "}
            <span className="font-semibold text-foreground">{email || "(none)"}</span>.
            The leadership list expects one of:{" "}
            <span className="font-medium text-foreground">
              martin@lessthanzerobarbers.com, cosmin@lessthanzerobarbers.com,
              mario@lessthanzerobarbers.com
            </span>
            . If this is not the address Martin expects, he is logged into a
            different account — sign out and back in with the correct email.
          </p>
        </Card>
      )}

      <Card
        className={`mb-4 p-5 ${resolvedId ? "border-emerald-500/50" : "border-red-500/50"}`}
      >
        <h2 className="mb-3 text-sm font-semibold text-foreground">Result</h2>
        {resolveError ? (
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
          Rows matching this name ({nameMatches.length})
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
              value={linkState(b, user.id, liveUserIds)}
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
              value={linkState(b, user.id, liveUserIds)}
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
  currentId: string,
  liveUserIds: Set<string>,
) {
  if (b.userId === null) return "unlinked (claimable)"
  if (!liveUserIds.has(b.userId)) return `orphaned login → claimable`
  if (b.userId === currentId) return "linked to THIS login"
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
