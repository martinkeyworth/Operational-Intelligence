import { requireUser } from "@/lib/access"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { RagDot } from "@/components/rag"
import { BarberRtbChart } from "@/components/barber-rtb-chart"
import { TeamSelfService } from "@/components/team-self-service"
import { getBarberForUser, getBarberSelfView, RTB_TARGET } from "@/lib/team"
import { fmtWeekLong, fmtGBP } from "@/lib/format"
import { CheckCircle2, AlertCircle, GraduationCap } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function TeamHomePage() {
  const user = await requireUser()
  const barber = await getBarberForUser(user.id)

  // A logged-in user with no linked barber record (e.g. a manager) shouldn't
  // land here — send dashboard users to the overview, everyone else to no-access.
  if (!barber) {
    redirect(user.canViewDashboard ? "/" : "/no-access")
  }

  const self = await getBarberSelfView(barber.id)
  if (!self) redirect("/no-access")

  const submitted = self.submission.submitted

  return (
    <AppShell user={user}>
      <PageHeader
        meta="Team Area"
        title={`Hi, ${self.barber.name.split(" ")[0]}`}
        subtitle={`${self.barber.role} · ${self.barber.siteName}`}
      />

      <div className="space-y-6 px-5 py-6 md:px-8">
        {/* 1. Weekly submission status — always at the very top. */}
        <Card
          className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${
            submitted ? "border-emerald-500/40" : "border-amber-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            {submitted ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-6 w-6 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                {submitted
                  ? `This week's takings submitted`
                  : `This week's takings are due`}
              </p>
              <p className="text-xs text-muted-foreground">
                Week ending {fmtWeekLong(self.submission.weekEnding)}
                {submitted ? ` · ${fmtGBP(self.submission.total)} recorded` : ""}
              </p>
            </div>
          </div>
          <Link
            href="/data-entry"
            className={buttonVariants({
              variant: submitted ? "outline" : "default",
              size: "sm",
            })}
          >
            {submitted ? "Edit takings" : "Submit takings"}
          </Link>
        </Card>

        {/* Apprentice gate banner */}
        {self.apprentice && (
          <Card className="flex items-center gap-3 p-4">
            <GraduationCap className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Apprentice progress — 3-month cutting & revenue gate
              </p>
              <p className="text-xs text-muted-foreground">
                {self.apprentice.pastGate
                  ? self.apprentice.rag === "green"
                    ? "Past the 3-month gate and earning revenue."
                    : "Past the 3-month gate — keep/separate decision needed."
                  : `${self.apprentice.daysToGate} days until the 3-month gate (due ${self.apprentice.gateDue}).`}
              </p>
            </div>
            <RagDot rag={self.apprentice.rag} />
          </Card>
        )}

        {/* 2. Personal RTB target vs actuals chart. */}
        <BarberRtbChart data={self.takings} />

        {/* 3. Their own weekly takings history. */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground">Your weekly takings</h3>
          <p className="text-xs text-muted-foreground">
            Tracked against the {fmtGBP(RTB_TARGET)} weekly RTB target
          </p>
          {self.takings.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No takings recorded yet. Submit your first week to start tracking.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Week ending</th>
                    <th className="pb-2 text-right font-medium">Takings</th>
                    <th className="pb-2 text-right font-medium">vs £{RTB_TARGET}</th>
                    <th className="pb-2 text-right font-medium">RAG</th>
                  </tr>
                </thead>
                <tbody>
                  {self.takings
                    .slice()
                    .reverse()
                    .map((t) => {
                      const delta = t.actual - t.target
                      const rag =
                        t.actual >= t.target
                          ? "green"
                          : t.actual >= t.target * 0.9
                            ? "amber"
                            : "red"
                      return (
                        <tr key={t.weekEnding} className="border-b border-border/50">
                          <td className="py-2 text-foreground">{fmtWeekLong(t.weekEnding)}</td>
                          <td className="py-2 text-right tabular-nums text-foreground">
                            {fmtGBP(t.actual)}
                          </td>
                          <td
                            className={`py-2 text-right tabular-nums ${
                              delta >= 0 ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {delta >= 0 ? "+" : ""}
                            {fmtGBP(delta)}
                          </td>
                          <td className="py-2">
                            <div className="flex justify-end">
                              <RagDot rag={rag} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 4. HR self-service: holiday, sickness, 1-2-1, 360. */}
        <TeamSelfService self={self} />
      </div>
    </AppShell>
  )
}
