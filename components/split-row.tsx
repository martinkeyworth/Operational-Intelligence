"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { fmtGBP } from "@/lib/format"
import { setBarberSplit, deactivateBarber } from "@/app/admin/splits/actions"
import type { BarberSplitRow } from "@/lib/data"
import {
  SWING_THRESHOLD_PCT,
  EXPECTED_WORKING_DAYS,
} from "@/lib/discrepancies-config"

export function SplitRow({ row }: { row: BarberSplitRow }) {
  const router = useRouter()
  const [pct, setPct] = useState<string>(
    row.barberPct == null ? "" : String(row.barberPct),
  )
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [cap, setCap] = useState<string>(
    row.cardRtbCap == null ? "" : String(row.cardRtbCap),
  )
  const [swing, setSwing] = useState<string>(
    row.swingThresholdPct == null ? "" : String(row.swingThresholdPct),
  )
  const [days, setDays] = useState<string>(
    row.expectedWorkingDays == null ? "" : String(row.expectedWorkingDays),
  )

  const parsed = pct === "" ? row.effectiveBarberPct : Number(pct)
  const business = Number.isFinite(parsed) ? 100 - parsed : 0
  const barberCut = (row.weekTakings * (Number.isFinite(parsed) ? parsed : 0)) / 100
  const businessCut = row.weekTakings - barberCut

  async function action(formData: FormData) {
    setPending(true)
    setSaved(false)
    try {
      await setBarberSplit(formData)
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    setRemoving(true)
    try {
      const fd = new FormData()
      fd.set("id", String(row.id))
      await deactivateBarber(fd)
      router.refresh()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <form
        action={action}
        className="flex flex-1 flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="cardRtbCap" value={cap} />
      <input type="hidden" name="swingThresholdPct" value={swing} />
      <input type="hidden" name="expectedWorkingDays" value={days} />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

      <div className="min-w-0 md:w-56">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {row.name}
          </p>
          {row.barberPct == null ? (
            <Badge variant="destructive" className="text-[10px]">
              Unset
            </Badge>
          ) : !row.reviewedThisWeek ? (
            <Badge variant="secondary" className="text-[10px]">
              Review
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {row.siteName} · {row.role}
        </p>
      </div>

      {!row.hasData ? (
        <p className="text-xs text-muted-foreground md:flex-1">
          No data loaded yet — split can be set after the first week is entered.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 md:flex-1">
            <label className="text-xs text-muted-foreground" htmlFor={`pct-${row.id}`}>
              Barber %
            </label>
            <Input
              id={`pct-${row.id}`}
              name="barberPct"
              type="number"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder={String(row.effectiveBarberPct)}
              className="h-9 w-20"
            />
            <span className="text-xs text-muted-foreground">
              / Business {Number.isFinite(business) ? business : "—"}%
            </span>
          </div>

          <div className="text-xs text-muted-foreground md:w-44 md:text-right">
            {row.weekTakings > 0 ? (
              <>
                <span className="text-foreground">{fmtGBP(barberCut)}</span> barber ·{" "}
                {fmtGBP(businessCut)} business
              </>
            ) : (
              "No takings this week"
            )}
          </div>
        </>
      )}

      {row.hasData && (
        <Button
          type="submit"
          size="sm"
          disabled={pending || pct === ""}
          className="h-9 gap-1.5 md:w-28"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {pending ? "Saving…" : saved ? "Saved" : "Set split"}
        </Button>
      )}
      </div>

      {row.hasData && (
        <div className="border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            RTB cap &amp; discrepancy flags
          </button>

          {showAdvanced && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor={`cap-${row.id}`}
                >
                  Card RTB cap (£)
                </label>
                <Input
                  id={`cap-${row.id}`}
                  type="number"
                  min={0}
                  step={10}
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  placeholder="200"
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor={`swing-${row.id}`}
                >
                  Swing alert (±%)
                </label>
                <Input
                  id={`swing-${row.id}`}
                  type="number"
                  min={0}
                  step={5}
                  value={swing}
                  onChange={(e) => setSwing(e.target.value)}
                  placeholder={`Default ${SWING_THRESHOLD_PCT}`}
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor={`days-${row.id}`}
                >
                  Expected days/week
                </label>
                <Input
                  id={`days-${row.id}`}
                  type="number"
                  min={0}
                  max={7}
                  step={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  placeholder={`Default ${EXPECTED_WORKING_DAYS}`}
                  className="h-9"
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Leave swing / days blank to use the system default. Changes save
                with &ldquo;Set split&rdquo;.
              </p>
            </div>
          )}
        </div>
      )}
      </form>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={removing}
              aria-label={`Remove ${row.name}`}
              className="h-auto self-stretch px-2 text-muted-foreground hover:text-rag-red"
            />
          }
        >
          {removing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {row.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {row.name} will be removed from data entry, headcount tallies and
              the splits list. Their past takings stay in reporting history, and
              this can be reversed later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-rag-red text-white hover:bg-rag-red/90"
            >
              Remove barber
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
