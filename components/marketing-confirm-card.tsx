"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { confirmMarketingWeek } from "@/app/actions/governance"
import { fmtWeekLong } from "@/lib/format"

/**
 * Mario's weekly sign-off that all social/marketing activity (every site + HR +
 * Training) has been reviewed. Confirming is what clears Marketing on the
 * submissions board — entered-but-unconfirmed shows "Awaiting sign-off".
 */
export function MarketingConfirmCard({
  week,
  confirmed,
  confirmedBy,
  canConfirm,
}: {
  week: string
  confirmed: boolean
  confirmedBy: string | null
  canConfirm: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onConfirm(formData: FormData) {
    setPending(true)
    try {
      await confirmMarketingWeek(formData)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  if (confirmed) {
    return (
      <Card className="flex items-center gap-3 border-rag-green/40 bg-rag-green/10 p-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-rag-green" />
        <div className="text-sm">
          <p className="font-medium text-foreground">
            Marketing confirmed for W/E {fmtWeekLong(week)}
          </p>
          {confirmedBy && (
            <p className="text-xs text-muted-foreground">
              Signed off by {confirmedBy}
            </p>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 border-rag-amber/40 bg-rag-amber/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-rag-amber" />
        <div className="text-sm">
          <p className="font-medium text-foreground">
            Awaiting sign-off — W/E {fmtWeekLong(week)}
          </p>
          <p className="text-xs text-muted-foreground text-pretty">
            Review every site&apos;s social posts and ratings plus HR and
            Training posts, then confirm the week.
          </p>
        </div>
      </div>
      {canConfirm && (
        <form action={onConfirm}>
          <input type="hidden" name="weekEnding" value={week} />
          <Button type="submit" disabled={pending} className="h-10 min-w-[140px]">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Confirm week"
            )}
          </Button>
        </form>
      )}
    </Card>
  )
}
