import pg from "pg";
import { readFileSync } from "fs";
let url;
for (const f of [".env.development.local",".env.local",".env"]) {
  try { const e = readFileSync(f,"utf8"); const m = e.match(/^DATABASE_URL='?([^'\n]+)'?/m); if (m){url=m[1];console.log("[v0] using",f);break;} } catch {}
}
if(!url){console.log("[v0] no DATABASE_URL in env files; trying process.env"); url=process.env.DATABASE_URL;}
const host = url? url.replace(/:[^:@]*@/,":***@").match(/@([^/]+)/)?.[1] : "none";
console.log("[v0] host:", host);
const pool = new pg.Pool({ connectionString: url });
try {
  const t = await pool.query("SELECT to_regclass('public.barbers') AS b, to_regclass('public.sites') AS s");
  console.log("[v0] tables barbers/sites:", t.rows[0]);
} catch(e){ console.log("[v0] ERR:", e.message); }
await pool.end();
