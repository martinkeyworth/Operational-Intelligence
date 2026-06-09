import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// Resolve the Postgres connection string. The Neon integration normally
// provisions DATABASE_URL, but when connected outside the Vercel Marketplace
// the string can be exposed under a different name (POSTGRES_URL, etc.). We
// check the common aliases so auth/db don't silently fall back to
// localhost:5432 (which produces ECONNREFUSED 127.0.0.1:5432 on sign-in).
function getConnectionString(): string {
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
  return connectionString
}

// Lazily create the pool + drizzle client on first use. This avoids throwing at
// module-import time (e.g. during `next build` page-data collection, when env
// vars are not present), while still surfacing a clear error if the connection
// string is genuinely missing at request time.
let _pool: Pool | undefined
let _db: NodePgDatabase<typeof schema> | undefined

export function getPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: getConnectionString() })
  return _pool
}

function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) _db = drizzle(getPool(), { schema })
  return _db
}

// `db` is a proxy that defers initialization until a property is actually
// accessed, so simply importing this module never connects or throws.
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real as object, prop, receiver)
    return typeof value === "function" ? value.bind(real) : value
  },
})

// Backwards-compatible accessor for code that imported `pool` directly.
export const pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const real = getPool()
    const value = Reflect.get(real as object, prop, receiver)
    return typeof value === "function" ? value.bind(real) : value
  },
})
