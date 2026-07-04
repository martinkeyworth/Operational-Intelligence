import { requireAdmin } from "@/lib/access"
import { getActiveBarbersBySite } from "@/lib/data"
import { PageHeader } from "@/components/ui-bits"
import { BarberAdminRow } from "@/components/barber-admin-row"

export default async function BarbersAdminPage() {
  await requireAdmin()
  const groups = await getActiveBarbersBySite()
  const total = groups.reduce((n, g) => n + g.barbers.length, 0)
  const siteOptions = groups.map((g) => ({ id: g.siteId, name: g.siteName }))

  return (
    <>
      <PageHeader
        meta="Admin"
        title="Barbers"
        subtitle="Active barbers by site. Use Change site to move someone who was auto-assigned to the wrong site (their takings move with them). Removing a barber takes them off data entry and headcount tallies while keeping their past takings in reporting history. It can be reversed later."
      />

      <div className="space-y-8 px-5 py-6 md:px-8">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No active barbers.</p>
        ) : (
          groups
            .filter((g) => g.barbers.length > 0)
            .map((g) => (
              <section key={g.siteId} className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                  {g.siteName}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({g.barbers.length})
                  </span>
                </h2>
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {g.barbers.map((b) => (
                    <BarberAdminRow key={b.id} barber={b} sites={siteOptions} />
                  ))}
                </div>
              </section>
            ))
        )}
      </div>
    </>
  )
}
