import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// Resolve the Postgres connection string. The Neon integration normally
// provisions DATABASE_URL, but when connected outside the Vercel Marketplace
// the string can be exposed under a different name (POSTGRES_URL, etc.). We
// check the common aliases so auth/db don't silently fall back to
// localhost:5432 (which produces ECONNREFUSED 127.0.0.1:5432 on sign-in).
const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.NEON_DATABASE_URL

if (!connectionString) {
  throw new Error(
    "No Postgres connection string found. Set DATABASE_URL (or POSTGRES_URL) in the project environment variables.",
  )
}

export const pool = new Pool({ connectionString })
export const db = drizzle(pool, { schema })
