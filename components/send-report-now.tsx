"use client"

import { useActionState } from "react"
import { Loader2, Send, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { sendBoardReportNow } from "@/app/reports/narrative-actions"

/**
 * Owner-only override to send the board report immediately, skipping any
 * pending COO/CEO input. Independent of the automatic 24h timeout.
 */
export function SendReportNow({
  weekEnding,
  pendingLabels,
}: {
  weekEnding: string
  // Which leadership inputs are still missing, e.g. ["COO narrative"].
  pendingLabels: string[]
}) {
  const [state, formAction, pending] = useActionState(sendBoardReportNow, null)
  const sent = state?.ok

  return (
    <Card className="border-amber-500/40 bg-amber-500/10 p-5">
      <div className="flex items-start gap-3">
        <Send className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            Send the board report now
          </h3>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {pendingLabels.length > 0
              ? `Sends immediately without the ${pendingLabels.join(
                  " and ",
                )}. The report will note the missing input.`
              : "Sends the consolidated board report to everyone now."}
          </p>

          {state?.error && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {state.error}
            </p>
          )}
          {sent && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {state?.message ?? "Board report sent."}
            </p>
          )}

          {!sent && (
            <form action={formAction} className="mt-4">
              <input type="hidden" name="weekEnding" value={weekEnding} />
              <Button
                type="submit"
                disabled={pending}
                className="h-11 w-full min-w-[180px] sm:w-auto"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Send board report now"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </Card>
  )
}
