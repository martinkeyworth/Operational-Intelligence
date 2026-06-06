import { requireDashboard } from "@/lib/access"
import { AppShell } from "@/components/app-shell"
import { PageHeader, StatCard } from "@/components/ui-bits"
import { FunctionAreaCard } from "@/components/function-area-card"
import { getFunctionAreaSummaries } from "@/lib/data"

export default async function FunctionsPage() {
  const user = await requireDashboard()
  const areas = await getFunctionAreaSummaries()

  const totalOpen = areas.reduce((s, a) => s + a.open, 0)
  const totalRed = areas.reduce((s, a) => s + a.red, 0)
  const onTrack = areas.filter((a) => a.rag === "green").length

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Functional Reporting"
        title="Functional Areas"
        subtitle="Performance, RAG status and open actions across every business function — not just the barbers. Drill into any area to see and manage its actions."
      />
      <div className="space-y-8 px-5 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Functional Areas" value={areas.length} />
          <StatCard
            label="On Track"
            value={`${onTrack}/${areas.length}`}
            sub="Areas with no red actions"
          />
          <StatCard label="Open Actions" value={totalOpen} />
          <StatCard
            label="Critical (Red)"
            value={totalRed}
            sub={totalRed > 0 ? "Need attention" : "All clear"}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <FunctionAreaCard key={area.key} area={area} />
          ))}
        </div>
      </div>
    </AppShell>
  )
}
