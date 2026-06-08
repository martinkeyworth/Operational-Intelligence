import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { auth } from "@/lib/auth"
import { eq } from "drizzle-orm"

async function main() {
  const email = process.argv[2]
  const newPassword = process.argv[3]
  if (!email || !newPassword) {
    console.error("Usage: tsx scripts/reset-password.ts <email> <password>")
    process.exit(1)
  }

  const [u] = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.email, email))

  if (!u) {
    console.error(`No user found for ${email}`)
    process.exit(1)
  }

  const ctx = await auth.$context
  const hashed = await ctx.password.hash(newPassword)

  const accounts = await ctx.internalAdapter.findAccounts(u.id)
  const credential = accounts.find((a) => a.providerId === "credential")

  if (credential) {
    await ctx.internalAdapter.updatePassword(u.id, hashed)
  } else {
    await ctx.internalAdapter.createAccount({
      userId: u.id,
      providerId: "credential",
      accountId: u.id,
      password: hashed,
    })
  }

  await ctx.internalAdapter.deleteUserSessions(u.id)

  console.log(`OK: reset password for ${u.name} <${u.email}> (id ${u.id})`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
