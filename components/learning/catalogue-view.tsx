type CourseLite = {
  id: number
  title: string
  provider: string | null
  delivery: string | null
  description: string | null
}
type Group = { category: string; courses: CourseLite[] }

/** Read-only course catalogue for barbers to browse. */
export function CatalogueView({ groups }: { groups: Group[] }) {
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No courses in the catalogue yet.
      </p>
    )
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.category} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {g.category}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {g.courses.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium text-foreground">{c.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[c.provider, c.delivery].filter(Boolean).join(" · ") || "—"}
                </p>
                {c.description ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
