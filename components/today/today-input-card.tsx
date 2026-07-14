"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Banknote, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { fmtGBP } from "@/lib/format"
import { saveTodayTakings } from "@/app/today/actions"

export function TodayInputCard({
  date,
  dateLabel,
  initialCash,
  initialCard,
  enteredToday,
  weekTotal,
}: {
  date: string
  dateLabel: string
  initialCash: number
  initialCard: number
  enteredToday: boolean
  weekTotal: number
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cash, setCash] = useState<string>(
    initialCash ? String(initialCash) : "",
  )
  const [card, setCard] = useState<string>(
    initialCard ? String(initialCard) : "",
  )

  const total = (Number(cash) || 0) + (Number(card) || 0)

  async function action(formData: FormData) {
    setPending(true)
    setSaved(false)
    try {
      await saveTodayTakings(formData)
      setSaved(true)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Card id="today-input" className="scroll-mt-24 p-5">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="date" value={date} />

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Today&apos;s takings</h2>
            <p className="text-sm text-muted-foreground">{dateLabel}</p>
          </div>
          {enteredToday && !saved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rag-green/15 px-2.5 py-1 text-xs font-medium text-rag-green">
              <Check className="h-3.5 w-3.5" /> Logged
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash" className="flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-muted-foreground" /> Cash (£)
            </Label>
            <Input
              id="cash"
              name="cash"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card" className="flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-muted-foreground" /> Card (£)
            </Label>
            <Input
              id="card"
              name="card"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={card}
              onChange={(e) => setCard(e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
          <span className="text-sm text-muted-foreground">Today&apos;s total</span>
          <span className="text-lg font-semibold">{fmtGBP(total)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            This week so far:{" "}
            <span className="font-medium text-foreground">
              {fmtGBP(weekTotal)}
            </span>
          </p>
          <Button type="submit" disabled={pending} className="h-11 min-w-32">
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : saved ? (
              <>
                <Check className="mr-1.5 h-4 w-4" /> Saved
              </>
            ) : enteredToday ? (
              "Update today"
            ) : (
              "Save today"
            )}
          </Button>
        </div>
      </form>
    </Card>
  )
}
