import "dotenv/config"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"

// One-off: set "password1" for users who have never logged in (zero sessions).
const TARGET_EMAILS = ["luke.dilly@yahoo.co.uk"]

async function main() {
  const ctx = await auth.$context
  const hash = await ctx.password.hash("password1")

  for (const email of TARGET_EMAILS) {
    const userRes = await pool.query(
      `SELECT id, email FROM "user" WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    )
    const user = userRes.rows[0]
    if (!user) {
      console.log("[v0] no user for", email)
      continue
    }

    // Guard: only reset if the user genuinely has no sessions.
    const sess = await pool.query(
      `SELECT count(*)::int AS c FROM "session" WHERE "userId" = $1`,
      [user.id],
    )
    if (sess.rows[0].c > 0) {
      console.log("[v0] skip (has logged in):", email)
      continue
    }

    const upd = await pool.query(
      `UPDATE account SET password = $1, "updatedAt" = now()
       WHERE "userId" = $2 AND "providerId" = 'credential'`,
      [hash, user.id],
    )
    console.log("[v0] updated", email, "rows:", upd.rowCount)
  }

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
