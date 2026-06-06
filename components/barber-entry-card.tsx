"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { fmtGBP } from "@/lib/format"
import { saveWeeklyTakings } from "@/app/data-entry/actions"
import type { DataEntryBarber } from "@/lib/data"

export function BarberEntryCard({
  barber,
  week,
}: {
  barber: DataEntryBarber
  week: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cash, setCash] = useState(barber.cash)
  const [card, setCard] = useState(barber.card)

  const total = (Number(cash) || 0) + (Number(card) || 0)
  const attainment =
    barber.targetWeekly > 0 ? (total / barber.targetWeekly) * 100 : 0

  async function action(formData: FormData) {
    setPending(true)
    setSaved(false)
    try {
      await saveWeeklyTakings(formData)
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="p-4 md:p-5">
      <form action={action}>
        <input type="hidden" name="barberId" value={barber.id} />
        <input type="hidden" name="weekEnding" value={week} />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{barber.name}</p>
            <p className="text-xs text-muted-foreground">
              {barber.role} · Target {fmtGBP(barber.targetWeekly)}
              {barber.reported ? " · Already reported" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {fmtGBP(total)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {attainment.toFixed(0)}% of target
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`cash-${barber.id}`} className="text-xs">
              Cash (£)
            </Label>
            <Input
              id={`cash-${barber.id}`}
              name="cash"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={barber.cash || ""}
              onChange={(e) => setCash(Number(e.target.value))}
              className="text-base"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`card-${barber.id}`} className="text-xs">
              Card (£)
            </Label>
            <Input
              id={`card-${barber.id}`}
              name="card"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={barber.card || ""}
              onChange={(e) => setCard(Number(e.target.value))}
              className="text-base"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`cashRent-${barber.id}`} className="text-xs">
              Cash rent (£)
            </Label>
            <Input
              id={`cashRent-${barber.id}`}
              name="cashRent"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={barber.cashRent || ""}
              className="text-base"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`cardRent-${barber.id}`} className="text-xs">
              Card rent (£)
            </Label>
            <Input
              id={`cardRent-${barber.id}`}
              name="cardRent"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={barber.cardRent || ""}
              className="text-base"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`manager-${barber.id}`} className="text-xs">
              Reported by / manager
            </Label>
            <Input
              id={`manager-${barber.id}`}
              name="manager"
              defaultValue={barber.manager}
              placeholder="Your name"
              className="text-base"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`comments-${barber.id}`} className="text-xs">
              Comments (optional)
            </Label>
            <Textarea
              id={`comments-${barber.id}`}
              name="comments"
              rows={1}
              defaultValue={barber.comments ?? ""}
              placeholder="Holiday, sickness, notes…"
              className="text-base"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox name="transferCompleted" defaultChecked={barber.transferCompleted} />
            Bank transfer completed
          </Label>
          <Button type="submit" size="sm" disabled={pending} className="h-9 gap-1.5">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {pending ? "Saving…" : saved ? "Saved" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  )
}
