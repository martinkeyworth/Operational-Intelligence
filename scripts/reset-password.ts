import "dotenv/config"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const email = process.argv[2]
const newPassword = process.argv[3]
if (!email || !newPassword) {
  console.error("usage: tsx scripts/reset-password.ts <email> <password>")
  process.exit(1)
}

const [target] = await db
  .select({ id: userTable.id, name: userTable.name, email: userTable.email })
  .from(userTable)
  .where(eq(userTable.email, email))

if (!target) {
  console.error(`[v0] No user found with email ${email}`)
  process.exit(1)
}

const ctx = await auth.$context
const hashed = await ctx.password.hash(newPassword)

const accounts = await ctx.internalAdapter.findAccounts(target.id)
const credential = accounts.find((a) => a.providerId === "credential")

if (credential) {
  await ctx.internalAdapter.updatePassword(target.id, hashed)
} else {
  await ctx.internalAdapter.createAccount({
    userId: target.id,
    providerId: "credential",
    accountId: target.id,
    password: hashed,
  })
}

await ctx.internalAdapter.deleteUserSessions(target.id)

console.log(`[v0] Password reset for ${target.name} <${target.email}> (id ${target.id})`)
process.exit(0)
