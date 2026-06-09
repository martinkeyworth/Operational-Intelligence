"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, MapPin, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fmtGBP } from "@/lib/format"
import { saveWeeklyTakings } from "@/app/data-entry/actions"
import type { DataEntryBarber, SiteOption } from "@/lib/data"

export function BarberEntryCard({
  barber,
  week,
  siteOptions,
}: {
  barber: DataEntryBarber
  week: string
  siteOptions: SiteOption[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  // Once submitted, the card collapses to a confirmation with the inputs
  // cleared so figures are stored and the form resets out of the way. The
  // manager can reopen it with "Edit" if a correction is needed.
  const [submitted, setSubmitted] = useState(false)
  const [recordedTotal, setRecordedTotal] = useState(0)
  const [cash, setCash] = useState(barber.cash)
  const [card, setCard] = useState(barber.card)
  const [siteId, setSiteId] = useState(String(barber.siteId))
  // Bumping this key remounts the form, clearing all uncontrolled inputs.
  const [formKey, setFormKey] = useState(0)

  const total = (Number(cash) || 0) + (Number(card) || 0)
  const attainment =
    barber.targetWeekly > 0 ? (total / barber.targetWeekly) * 100 : 0

  async function action(formData: FormData) {
    setPending(true)
    setSaved(false)
    try {
      await saveWeeklyTakings(formData)
      setRecordedTotal((Number(cash) || 0) + (Number(card) || 0))
      setSaved(true)
      setSubmitted(true)
      // Reset the working fields and remount the form so nothing stale lingers.
      setCash(0)
      setCard(0)
      setFormKey((k) => k + 1)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  function reopen() {
    setSubmitted(false)
    setSaved(false)
  }

  if (submitted) {
    return (
      <Card className="flex items-center justify-between gap-3 border-rag-green/40 bg-rag-green/5 p-4 md:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rag-green/15 text-rag-green">
            <Check className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{barber.name}</p>
            <p className="text-xs text-muted-foreground">
              Submitted · {fmtGBP(recordedTotal)} recorded
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reopen}
          className="h-9 gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </Card>
    )
  }

  return (
    <Card className="p-4 md:p-5">
      <form key={formKey} action={action}>
        <input type="hidden" name="barberId" value={barber.id} />
        <input type="hidden" name="weekEnding" value={week} />
        <input type="hidden" name="siteId" value={siteId} />

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

        <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
          <Label
            htmlFor={`site-${barber.id}`}
            className="flex items-center gap-1.5 text-xs font-medium text-foreground"
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Confirm working location this week
          </Label>
          <Select
            name="site"
            value={siteId}
            onValueChange={(v) => v && setSiteId(v)}
          >
            <SelectTrigger
              id={`site-${barber.id}`}
              className="mt-2 h-10 w-full text-base sm:max-w-xs"
            >
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
              {siteOptions.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {String(barber.siteId) !== siteId && (
            <p className="mt-1.5 text-xs text-rag-amber">
              Base location will be updated to keep site KPIs accurate.
            </p>
          )}
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
