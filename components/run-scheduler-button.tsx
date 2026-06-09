"use client"

import { useState, useTransition } from "react"
import { CalendarClock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { runTeamScheduler } from "@/app/admin/team/actions"

/**
 * Lets leadership trigger the Team Area scheduler on demand instead of waiting
 * for the daily cron. Reports how many 1-2-1s were scheduled and 360 cycles
 * opened. Idempotent — re-running won't create duplicates.
 */
export function RunSchedulerButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  function run() {
    setResult(null)
    startTransition(async () => {
      try {
        const res = await runTeamScheduler()
        setResult(
          `Scheduled ${res.oneToOnes} 1-2-1${res.oneToOnes === 1 ? "" : "s"} and opened ${res.threeSixties} 360 cycle${res.threeSixties === 1 ? "" : "s"}.`,
        )
      } catch {
        setResult("Something went wrong. Please try again.")
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <Button onClick={run} disabled={pending} variant="outline" size="sm">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarClock className="h-4 w-4" />
        )}
        Run scheduler now
      </Button>
      {result && <p className="text-sm text-muted-foreground">{result}</p>}
    </div>
  )
}
