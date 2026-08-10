import { redirect } from "next/navigation"
import Link from "next/link"
import { requireAdmin } from "@/lib/access"
import { db } from "@/lib/db"
import { barbers as barbersTable, user as userTable } from "@/lib/db/schema"
import { resolveBarberForUser } from "@/lib/team"
import { isLeadershipHolidayEmail } from "@/lib/access-types"
import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"

export const dynamic = "force-dynamic"

// Owner-only diagnostic that explains, in plain terms, whether the signed-in
// user can reach the personal Team Area — and repairs a broken barber link on
// the spot (resolveBarberForUser self-heals / provisions for leadership).
export default async function TeamAccessCheckPage() {
  const user = await requireAdmin()
  if (!user.isOwner) redirect("/no-access")

  const email = user.email
  const leadership = isLeadershipHolidayEmail(email)

  // Snapshot BEFORE resolution: every barber row + which login ids are live.
  const allBarbers = await db
    .select({
      id: barbersTable.id,
      name: barbersTable.name,
      userId: barbersTable.userId,
      active: barbersTable.active,
      siteId: barbersTable.siteId,
    })
    .from(barbersTable)
  const liveUsers = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email })
    .from(userTable)
  const liveUserIds = new Set(liveUsers.map((u) => u.id))

  const displayName = (user.name?.trim() || email.split("@")[0]).trim()
  const firstName = displayName.split(/\s+/)[0]?.toLowerCase()
  const nameMatches = allBarbers.filter(
    (b) =>
      b.name.trim().toLowerCase() === displayName.toLowerCase() ||
      b.name.trim().toLowerCase().split(/\s+/)[0] === firstName,
  )

  // Resolve (this WRITES: links an unlinked/orphaned row by name, or provisions
  // for leadership) — so simply loading this page repairs the account.
  let resolved: Awaited<ReturnType<typeof resolveBarberForUser>> = null
  let resolveError: string | null = null
  try {
    resolved = await resolveBarberForUser({ id: user.id, name: user.name, email })
  } catch (e) {
    resolveError = e instanceof Error ? e.message : String(e)
  }

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-4 border-b border-border/50 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground break-all">{value}</span>
    </div>
  )

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:px-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground text-balance">
          Team Area access check
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Diagnoses why a leader can or cannot reach their personal Team Area.
          Loading this page also repairs the barber link for the signed-in user.
        </p>
      </header>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Signed-in user</h2>
        <Row label="Login id" value={user.id} />
        <Row label="Email" value={email} />
        <Row label="Name" value={displayName} />
        <Row label="Is owner" value={String(user.isOwner)} />
        <Row label="Can view dashboard" value={String(user.canViewDashboard)} />
        <Row label="Is barber (capability)" value={String(user.isBarber)} />
        <Row label="Recognised as leadership" value={String(leadership)} />
      </Card>

      <Card
        className={`mb-4 p-5 ${resolved ? "border-emerald-500/50" : "border-red-500/50"}`}
      >
        <h2 className="mb-3 text-sm font-semibold text-foreground">Result</h2>
        {resolveError ? (
          <p className="text-sm text-red-600">
            Resolution threw an error: {resolveError}
          </p>
        ) : resolved ? (
          <>
            <p className="mb-3 text-sm text-emerald-600">
              Linked to barber #{resolved.id} ({resolved.name}). Team Area should
              now work — open it below.
            </p>
            <Link href="/team" className={buttonVariants({ size: "sm" })}>
              Go to Team Area
            </Link>
          </>
        ) : (
          <p className="text-sm text-red-600">
            No barber record could be linked. See the roster below — either there
            is no row matching this name, or the matching row is owned by another
            active login.
          </p>
        )}
      </Card>

      <Card className="mb-4 p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Rows matching this name ({nameMatches.length})
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          A row is claimable if it has no linked login, or its linked login no
          longer exists (orphaned).
        </p>
        {nameMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No barber row matches “{displayName}”.
          </p>
        ) : (
          nameMatches.map((b) => {
            const orphaned = b.userId !== null && !liveUserIds.has(b.userId)
            const state =
              b.userId === null
                ? "unlinked"
                : orphaned
                  ? `orphaned (login ${b.userId} not found)`
                  : b.userId === user.id
                    ? "linked to THIS login"
                    : `linked to another live login (${b.userId})`
            return (
              <Row
                key={b.id}
                label={`#${b.id} ${b.name}${b.active ? "" : " (inactive)"}`}
                value={state}
              />
            )
          })
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
              value={
                b.userId === null
                  ? "no login linked"
                  : liveUserIds.has(b.userId)
                    ? b.userId === user.id
                      ? "THIS login"
                      : "another login"
                    : "orphaned login"
              }
            />
          ))}
        </div>
      </Card>
    </main>
  )
}
