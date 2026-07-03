import { requireUser, canManageLearning } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { CatalogueManager } from "@/components/learning/catalogue-manager"
import { CatalogueView } from "@/components/learning/catalogue-view"
import { coursesByCategory, roleOptions, listRoleGates } from "@/lib/learning"

export const dynamic = "force-dynamic"

export default async function CoursesPage() {
  const user = await requireUser()
  const canManage = canManageLearning(user)

  const groups = await coursesByCategory()

  if (!canManage) {
    return (
      <AppShell user={user}>
        <PageHeader
          meta="L&D – Training"
          title="Course catalogue"
          subtitle="Courses and qualifications across the group"
        />
        <div className="px-5 py-6 md:px-8">
          <CatalogueView
            groups={groups.map((g) => ({
              category: g.category,
              courses: g.courses.map((c) => ({
                id: c.id,
                title: c.title,
                provider: c.provider,
                delivery: c.delivery,
                description: c.description,
              })),
            }))}
          />
        </div>
      </AppShell>
    )
  }

  const gates = await listRoleGates()
  return (
    <AppShell user={user}>
      <PageHeader
        meta="L&D – Training"
        title="Course catalogue"
        subtitle="Manage courses, role prerequisites and gates"
      />
      <div className="px-5 py-6 md:px-8">
        <CatalogueManager
          groups={groups.map((g) => ({
            category: g.category,
            courses: g.courses.map((c) => ({
              id: c.id,
              title: c.title,
              provider: c.provider,
              category: c.category,
              delivery: c.delivery,
              active: c.active,
              reqs: c.reqs.map((r) => ({ role: r.role, requirement: r.requirement })),
            })),
          }))}
          roles={roleOptions()}
          gates={gates.map((g) => ({ id: g.id, role: g.role, requirement: g.requirement }))}
        />
      </div>
    </AppShell>
  )
}
