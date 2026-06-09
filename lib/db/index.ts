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

if (!connectionString && process.env.NODE_ENV !== "production") {
  // Warn (don't throw) so `next build` page-data collection doesn't crash when
  // env vars are absent. At request time a missing string surfaces a clear
  // connection error instead.
  console.warn(
    "[v0] No Postgres connection string found. Set DATABASE_URL (or POSTGRES_URL) in the project environment variables.",
  )
}

// IMPORTANT: export a REAL pg.Pool instance (not a lazy Proxy). Better Auth
// detects the database adapter by checking `"connect" in db` on the object it
// is given; a Proxy over an empty target fails that check and throws
// "Failed to initialize database adapter". `new Pool()` does not open a
// connection until the pool is actually used, so this stays build-safe.
export const pool = new Pool(connectionString ? { connectionString } : {})

export const db = drizzle(pool, { schema })
