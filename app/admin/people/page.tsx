import { requireAdmin, getAllUsers } from "@/lib/access"
import { PageHeader } from "@/components/ui-bits"
import { UserAccessCard } from "@/components/user-access-card"

export default async function PeopleAccessPage() {
  await requireAdmin()
  const users = await getAllUsers()

  const company = users.filter((u) => u.isCompany)
  const external = users.filter((u) => !u.isCompany)

  return (
    <>
      <PageHeader
        meta="Admin"
        title="People & Access"
        subtitle="Control who can see the dashboard and what each person is responsible for. Anyone with a lessthanzerobarbers.com email gets dashboard access by default; everyone else can only enter weekly takings."
      />

      <div className="space-y-8 px-5 py-6 md:px-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Company team ({company.length})
          </h2>
          {company.length === 0 ? (
            <p className="text-sm text-muted-foreground">No company users yet.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {company.map((u) => (
                <UserAccessCard key={u.id} user={u} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            External / barbers ({external.length})
          </h2>
          {external.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No external accounts yet.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {external.map((u) => (
                <UserAccessCard key={u.id} user={u} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
