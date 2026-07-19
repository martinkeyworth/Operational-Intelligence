"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ShieldCheck, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { confirmSiteWeek } from "@/app/actions/governance"
import { fmtWeekLong, fmtGBP } from "@/lib/format"
import type {
  SiteConfirmReview,
  DiscrepancyState,
  DiscrepancyDecision,
} from "@/lib/site-confirm-review"

export const SITE_BRANDS = [
  "Less Than Zero",
  "F.AF",
  "Velvet Ash",
] as const

export function ConfirmSiteDialog({
  siteId,
  siteName,
  location,
  brand,
  managerName,
  headcount,
  week,
  confirmed,
  confirmedBy,
  review,
}: {
  siteId: number
  siteName: string
  location: string
  brand: string
  managerName: string | null
  headcount: number
  week: string
  confirmed: boolean
  confirmedBy: string | null
  /** Per-barber computed RTB + discrepancy flags for this week (optional). */
  review?: SiteConfirmReview
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  // Accept/refuse decisions per barber per flag, seeded from any saved on the
  // last confirmation. Key shape: { [barberId]: { [flagKind]: decision } }.
  const [decisions, setDecisions] = useState<DiscrepancyState>(
    () => (review?.savedDecisions ?? {}) as DiscrepancyState,
  )

  const totalFlags = useMemo(
    () => review?.barbers.reduce((s, b) => s + b.flags.length, 0) ?? 0,
    [review],
  )
  const decidedFlags = useMemo(() => {
    if (!review) return 0
    return review.barbers.reduce(
      (s, b) => s + b.flags.filter((f) => decisions[b.barberId]?.[f.kind]).length,
      0,
    )
  }, [review, decisions])
  const allResolved = totalFlags === 0 || decidedFlags === totalFlags

  function setDecision(
    barberId: number,
    kind: string,
    decision: DiscrepancyDecision,
  ) {
    setDecisions((prev) => ({
      ...prev,
      [barberId]: { ...(prev[barberId] ?? {}), [kind]: decision },
    }))
  }

  async function action(formData: FormData) {
    setPending(true)
    try {
      await confirmSiteWeek(formData)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {confirmed ? (
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-rag-green/30 text-rag-green hover:text-rag-green"
            />
          }
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirmed
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" className="h-8 gap-1.5" />}>
          <ShieldCheck className="h-3.5 w-3.5" />
          Confirm week
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form action={action}>
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="weekEnding" value={week} />
          <input
            type="hidden"
            name="discrepancyState"
            value={JSON.stringify(decisions)}
          />
          <DialogHeader>
            <DialogTitle>Confirm week &amp; takings</DialogTitle>
            <DialogDescription>
              Functional leader sign-off for {siteName} — week ending{" "}
              {fmtWeekLong(week)}. Review each barber&apos;s takings and RTB,
              resolve any flags, then confirm.
            </DialogDescription>
          </DialogHeader>
          {review && review.barbers.length > 0 && (
            <div className="grid gap-3 border-b py-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">This week&apos;s takings &amp; RTB</h4>
                {totalFlags > 0 && (
                  <span
                    className={`text-xs font-medium ${
                      allResolved ? "text-rag-green" : "text-rag-amber"
                    }`}
                  >
                    {decidedFlags}/{totalFlags} flags resolved
                  </span>
                )}
              </div>
              <div className="grid gap-2">
                {review.barbers.map((b) => (
                  <div
                    key={b.barberId}
                    className="rounded-md border bg-card p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-muted-foreground">
                        {fmtGBP(b.cash + b.card)} total · RTB{" "}
                        <span className="font-medium text-foreground">
                          {fmtGBP(b.totalRent)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Cash {fmtGBP(b.cash)} (RTB {fmtGBP(b.cashRent)}) · Card{" "}
                      {fmtGBP(b.card)} (RTB {fmtGBP(b.cardRent)})
                    </div>
                    {b.flags.map((f) => {
                      const decided = decisions[b.barberId]?.[f.kind]
                      return (
                        <div
                          key={f.kind}
                          className="mt-2 rounded border border-rag-amber/40 bg-rag-amber/10 p-2"
                        >
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rag-amber" />
                            <span className="text-xs">{f.detail}</span>
                          </div>
                          <div className="mt-1.5 flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={decided === "accepted" ? "default" : "outline"}
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                setDecision(b.barberId, f.kind, "accepted")
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={decided === "refused" ? "destructive" : "outline"}
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                setDecision(b.barberId, f.kind, "refused")
                              }
                            >
                              Refuse
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="siteNameConfirmed">Confirmed site name</Label>
              <Input
                id="siteNameConfirmed"
                name="siteNameConfirmed"
                defaultValue={siteName}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="locationConfirmed">Site location</Label>
                <Input
                  id="locationConfirmed"
                  name="locationConfirmed"
                  defaultValue={location}
                  placeholder="Town / area"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="brandConfirmed">Site brand</Label>
                <select
                  id="brandConfirmed"
                  name="brandConfirmed"
                  defaultValue={brand}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {SITE_BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="managerConfirmed">Site manager</Label>
                <Input
                  id="managerConfirmed"
                  name="managerConfirmed"
                  defaultValue={managerName ?? ""}
                  placeholder="Name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="headcountConfirmed">Headcount</Label>
                <Input
                  id="headcountConfirmed"
                  name="headcountConfirmed"
                  type="number"
                  min={0}
                  defaultValue={headcount}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={2}
                placeholder="Any changes or context for this week…"
              />
            </div>
            {confirmed && confirmedBy && (
              <p className="text-xs text-muted-foreground">
                Previously confirmed by {confirmedBy}. Re-submitting will update
                the record.
              </p>
            )}
          </div>
          <DialogFooter className="sticky bottom-0 -mx-4 -mb-4 border-t bg-popover px-4 py-3">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || !allResolved}>
              {pending
                ? "Saving…"
                : !allResolved
                  ? `Resolve ${totalFlags - decidedFlags} more flag${
                      totalFlags - decidedFlags === 1 ? "" : "s"
                    } to confirm`
                  : "Confirm week"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
