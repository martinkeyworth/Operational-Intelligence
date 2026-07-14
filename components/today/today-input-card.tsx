"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Banknote, CreditCard, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { fmtGBP } from "@/lib/format"
import { addTakingsLine, deleteTakingsLine } from "@/app/today/actions"
import type { TakingsLine } from "@/lib/daily-takings"

export function TodayInputCard({
  dateLabel,
  lines,
  todayCash,
  todayCard,
  weekTotal,
}: {
  dateLabel: string
  lines: TakingsLine[]
  todayCash: number
  todayCard: number
  weekTotal: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<"cash" | "card">("cash")
  const [error, setError] = useState<string | null>(null)

  const todayTotal = todayCash + todayCard

  function addCut() {
    const value = Number(amount)
    if (!value || value <= 0) {
      setError("Enter an amount.")
      return
    }
    setError(null)
    const fd = new FormData()
    fd.set("amount", String(value))
    fd.set("method", method)
    startTransition(async () => {
      await addTakingsLine(fd)
      setAmount("")
      router.refresh()
    })
  }

  function removeCut(id: number) {
    const fd = new FormData()
    fd.set("id", String(id))
    startTransition(async () => {
      await deleteTakingsLine(fd)
      router.refresh()
    })
  }

  return (
    <Card id="today-input" className="scroll-mt-24 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Today&apos;s takings</h2>
            <p className="text-sm text-muted-foreground">
              {dateLabel} · add each cut as it&apos;s paid
            </p>
          </div>
          <span className="text-right">
            <span className="block text-xs text-muted-foreground">
              Today&apos;s total
            </span>
            <span className="block text-lg font-semibold">
              {fmtGBP(todayTotal)}
            </span>
          </span>
        </div>

        {/* Add a cut */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                £
              </span>
              <Input
                aria-label="Cut amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  if (error) setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    addCut()
                  }
                }}
                className="h-12 pl-7 text-base"
              />
            </div>
            <Button
              type="button"
              onClick={addCut}
              disabled={pending}
              className="h-12 min-w-24"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" /> Add
                </>
              )}
            </Button>
          </div>

          {/* Payment method toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod("cash")}
              aria-pressed={method === "cash"}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors ${
                method === "cash"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <Banknote className="h-4 w-4" /> Cash
            </button>
            <button
              type="button"
              onClick={() => setMethod("card")}
              aria-pressed={method === "card"}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors ${
                method === "card"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <CreditCard className="h-4 w-4" /> Card
            </button>
          </div>
          {error && <p className="text-xs text-rag-red">{error}</p>}
        </div>

        {/* Today's cuts */}
        {lines.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {lines.map((line) => (
              <li
                key={line.id}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                {line.method === "card" ? (
                  <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 text-sm font-medium">
                  {fmtGBP(line.amount)}
                </span>
                <span className="text-xs capitalize text-muted-foreground">
                  {line.method}
                </span>
                <button
                  type="button"
                  onClick={() => removeCut(line.id)}
                  disabled={pending}
                  aria-label="Remove cut"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rag-red"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No cuts logged yet today. Add your first above.
          </p>
        )}

        {/* Split + week */}
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cash / Card today</span>
            <span className="font-medium">
              {fmtGBP(todayCash)} / {fmtGBP(todayCard)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">This week so far</span>
            <span className="font-medium">{fmtGBP(weekTotal)}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
