import { Card } from "@/components/ui/card"
import { RagBadge } from "@/components/rag"
import { fmtGBP, fmtWeekLong, type Rag } from "@/lib/format"
import { Armchair, TrendingUp } from "lucide-react"

type CapacityKpis = {
  activeBarbers: number
  rtbBarbers: number
  chairCapacity: number
  utilisationPct: number
  utilisationRag: Rag
  vacantChairs: number
  rtbPerBarber: number
  rtbExpected: number
  rtbActual: number
  rtbAttainmentPct: number
  rtbRag: Rag
  rtbReported: boolean
  inProgress: boolean
  pastDeadline: boolean
  allReported: boolean
  lastWeekActual: number | null
  lastWeekReported: boolean
  rtbProjected: number | null
  barbersReported: number
}

export function CapacityCard({
  week,
  kpis,
}: {
  week: string
  kpis: CapacityKpis
}) {
  const rtbShortfall = kpis.rtbExpected - kpis.rtbActual

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Chair utilisation */}
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Armchair className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Chair Utilisation
              </h2>
              <p className="text-xs text-muted-foreground">
                Active barbers vs chair capacity
              </p>
            </div>
          </div>
          <RagBadge rag={kpis.utilisationRag} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">In chairs</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {kpis.activeBarbers}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Capacity</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {kpis.chairCapacity}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Vacant</p>
            <p
              className={
                "text-2xl font-semibold tabular-nums " +
                (kpis.vacantChairs > 0 ? "text-rag-red" : "text-rag-green")
              }
            >
              {kpis.vacantChairs}
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={
              "h-full rounded-full " +
              (kpis.utilisationRag === "green" ? "bg-rag-green" : "bg-rag-red")
            }
            style={{ width: `${Math.min(100, kpis.utilisationPct)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {kpis.utilisationPct.toFixed(0)}% utilised
        </p>

        {kpis.vacantChairs > 0 && (
          <p className="mt-3 rounded-md border border-rag-red/30 bg-rag-red/5 px-3 py-2 text-xs text-rag-red">
            Underutilised — {kpis.vacantChairs} of {kpis.chairCapacity} chairs
            empty. A capacity action has been raised.
          </p>
        )}
      </Card>

      {/* Revenue To Business */}
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Revenue To Business
              </h2>
              <p className="text-xs text-muted-foreground">
                {fmtGBP(kpis.rtbPerBarber)}/barber/week · W/E{" "}
                {fmtWeekLong(week)}
              </p>
            </div>
          </div>
          {kpis.inProgress ? (
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              In progress
            </span>
          ) : (
            <RagBadge rag={kpis.rtbRag} />
          )}
        </div>

        {kpis.inProgress ? (
          <>
            {/* Current week still open: show last week + a run-rate projection
                rather than a premature shortfall. */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Last week</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {kpis.lastWeekActual != null
                    ? fmtGBP(kpis.lastWeekActual)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  This week (proj.)
                </p>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {kpis.rtbProjected != null
                    ? fmtGBP(kpis.rtbProjected)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {kpis.barbersReported}/{kpis.rtbBarbers}
                </p>
              </div>
            </div>

            <p className="mt-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {kpis.barbersReported > 0
                ? `Projection is a run-rate from the ${kpis.barbersReported} barber${
                    kpis.barbersReported === 1 ? "" : "s"
                  } in so far. Final RTB is graded after the Saturday 18:00 deadline.`
                : "Awaiting this week's submissions. Final RTB is graded against the agreed KPI after the Saturday 18:00 deadline."}
            </p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Returned</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {kpis.rtbReported ? fmtGBP(kpis.rtbActual) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expected</p>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {fmtGBP(kpis.rtbExpected)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {rtbShortfall > 0 ? "Shortfall" : "Surplus"}
                </p>
                <p
                  className={
                    "text-xl font-semibold tabular-nums " +
                    (rtbShortfall > 0 ? "text-rag-red" : "text-rag-green")
                  }
                >
                  {kpis.rtbReported
                    ? `${rtbShortfall > 0 ? "-" : "+"}${fmtGBP(
                        Math.abs(rtbShortfall),
                      )}`
                    : "—"}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Expected = {kpis.rtbBarbers} barbers × {fmtGBP(kpis.rtbPerBarber)}
            </p>

            {kpis.rtbReported && kpis.rtbActual < kpis.rtbExpected && (
              <p className="mt-3 rounded-md border border-rag-red/30 bg-rag-red/5 px-3 py-2 text-xs text-rag-red">
                Below the {fmtGBP(kpis.rtbPerBarber)}/barber assumption — an RTB
                action has been raised.
              </p>
            )}
            {!kpis.rtbReported && (
              <p className="mt-3 rounded-md border border-rag-red/30 bg-rag-red/5 px-3 py-2 text-xs text-rag-red">
                No takings submitted by the Saturday 18:00 deadline — this is now
                outstanding.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
