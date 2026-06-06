import { notFound } from "next/navigation"
import Link from "next/link"
import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { ActionsTable } from "@/components/actions-table"
import { RagBadge } from "@/components/rag"
import { getFunctionAreaActions, getAssignableOwners } from "@/lib/data"
import { findFunctionArea } from "@/lib/function-areas"
import { ArrowLeft } from "lucide-react"

export default async function FunctionAreaPage({
  params,
}: {
  params: Promise<{ area: string }>
}) {
  const { area: areaParam } = await params
  const areaKey = decodeURIComponent(areaParam)
  const area = findFunctionArea(areaKey)
  if (!area) notFound()

  const user = await requireDashboard()
  const [actions, owners] = await Promise.all([
    getFunctionAreaActions(area.key),
    getAssignableOwners(),
  ])

  const open = actions.filter((a) => a.status !== "Closed")
  const red = open.filter((a) => a.rag === "red").length
  const amber = open.filter((a) => a.rag === "amber").length
  const rag = red > 0 ? "red" : amber > 0 ? "amber" : "green"

  return (
    <AppShell user={user}>
      <PageHeader
        meta={`Functional Area · ${area.ownerRole}`}
        title={area.label}
        subtitle={area.description}
      >
        <RagBadge rag={rag} className="px-3 py-1 text-sm" />
      </PageHeader>
      <div className="space-y-6 px-5 py-6 md:px-8">
        <Link
          href="/functions"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All functional areas
        </Link>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Open Actions" value={open.length} />
          <StatCard label="Critical (Red)" value={red} />
          <StatCard label="At Risk (Amber)" value={amber} />
          <StatCard label="Total Logged" value={actions.length} />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {area.label} Actions
          </h2>
          <ActionsTable actions={actions} owners={owners} />
        </div>
      </div>
    </AppShell>
  )
}
