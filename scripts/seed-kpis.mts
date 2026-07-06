// One-off seed: ensure the `kpis` table has a row for every KPI code in the
// static catalogue (lib/kpi-config.ts). KPI weekly values (kpi_values) join to
// kpis.id via kpis.code, so a code with no catalogue row can never be entered
// or read. Idempotent — inserts missing codes, updates metadata on existing.
import { Pool } from "pg"
import { KPI_CATALOGUE } from "../lib/kpi-config"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
})

// Map the catalogue's amber/no-amber model onto the kpis table columns. For
// no-amber KPIs we store the green threshold in both columns (the RAG engine
// in kpi-config ignores amber for these, but keeping a value avoids NULLs).
function thresholds(d: (typeof KPI_CATALOGUE)[number]) {
  const green = d.green ?? null
  const amber = d.noAmber ? d.green ?? null : d.amber ?? null
  return { green, amber }
}

async function main() {
  let inserted = 0
  let updated = 0
  for (const d of KPI_CATALOGUE) {
    const { green, amber } = thresholds(d)
    const res = await pool.query(
      `insert into kpis
         (code, name, category, function_area, unit, green_threshold,
          amber_threshold, direction, frequency, owner_role, owner_name)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'Weekly',$9,$10)
       on conflict (code) do update set
         name = excluded.name,
         function_area = excluded.function_area,
         unit = excluded.unit,
         green_threshold = excluded.green_threshold,
         amber_threshold = excluded.amber_threshold,
         direction = excluded.direction,
         owner_role = excluded.owner_role,
         owner_name = excluded.owner_name
       returning (xmax = 0) as inserted`,
      [
        d.code,
        d.name,
        d.functionArea,
        d.functionArea,
        d.unit ?? "",
        green,
        amber,
        d.direction ?? "higher_better",
        d.ownerRole ?? "",
        d.owner ?? "",
      ],
    )
    if (res.rows[0]?.inserted) inserted++
    else updated++
  }
  console.log(`Seeded kpis: ${inserted} inserted, ${updated} updated.`)
  const all = await pool.query(
    "select function_area, count(*) from kpis group by function_area order by function_area",
  )
  for (const r of all.rows) console.log("  ", r.function_area, r.count)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
