"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Banknote,
  CreditCard,
  Plus,
  Trash2,
  UserX,
  Coins,
  Scissors,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { fmtGBP } from "@/lib/format"
import { addTakingsLine, deleteTakingsLine } from "@/app/today/actions"
import type { TakingsLine, TakingsKind } from "@/lib/daily-takings"

type Method = "cash" | "card"

const KINDS: { key: TakingsKind; label: string; icon: typeof Scissors }[] = [
  { key: "cut", label: "Cut", icon: Scissors },
  { key: "no_show", label: "No-show", icon: UserX },
  { key: "tip", label: "Tip", icon: Coins },
]

export function TodayInputCard({
  dateLabel,
  lines,
  todayCash,
  todayCard,
  todayTips,
  todayNoShows,
  weekTotal,
  weekTips,
  weekNoShows,
}: {
  dateLabel: string
  lines: TakingsLine[]
  todayCash: number
  todayCard: number
  todayTips: number
  todayNoShows: number
  weekTotal: number
  weekTips: number
  weekNoShows: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<Method>("cash")
  const [kind, setKind] = useState<TakingsKind>("cut")
  const [error, setError] = useState<string | null>(null)

  // Revenue = cuts only. No-shows are auto-charged to card (awaiting sign-off);
  // tips are 100% the barber's.
  const todayRevenue = todayCash + todayCard

  function addLine() {
    const value = Number(amount)
    if (!value || value <= 0) {
      setError("Enter an amount.")
      return
    }
    setError(null)
    const fd = new FormData()
    fd.set("amount", String(value))
    fd.set("kind", kind)
    // No-shows auto-charge to card; tips carry no method; cuts use the toggle.
    fd.set("method", kind === "no_show" ? "card" : method)
    startTransition(async () => {
      await addTakingsLine(fd)
      setAmount("")
      router.refresh()
    })
  }

  function removeLine(id: number) {
    const fd = new FormData()
    fd.set("id", String(id))
    startTransition(async () => {
      await deleteTakingsLine(fd)
      router.refresh()
    })
  }

  const showMethod = kind === "cut"

  return (
    <Card id="today-input" className="scroll-mt-24 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Today&apos;s takings</h2>
            <p className="text-sm text-muted-foreground">
              {dateLabel} · log each cut, no-show and tip as it happens
            </p>
          </div>
          <span className="text-right">
            <span className="block text-xs text-muted-foreground">
              Revenue today
            </span>
            <span className="block text-lg font-semibold">
              {fmtGBP(todayRevenue)}
            </span>
          </span>
        </div>

        {/* What am I logging? */}
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setKind(key)}
              aria-pressed={kind === key}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors ${
                kind === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* Helper line per kind */}
        <p className="text-xs text-muted-foreground">
          {kind === "cut"
            ? "A normal paid haircut — counts towards your revenue and split."
            : kind === "no_show"
              ? "No-show fee, auto-charged to card. Your manager confirms at weekly sign-off whether payment came through before it counts as revenue."
              : "A tip — 100% yours, no split taken. Added to your weekly take-home."}
        </p>

        {/* Amount + add */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                £
              </span>
              <Input
                aria-label="Amount"
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
                    addLine()
                  }
                }}
                className="h-12 pl-7 text-base"
              />
            </div>
            <Button
              type="button"
              onClick={addLine}
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

          {/* Payment method toggle (cuts only) */}
          {showMethod && (
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
          )}
          {error && <p className="text-xs text-rag-red">{error}</p>}
        </div>

        {/* Today's entries */}
        {lines.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 px-3 py-2.5">
                <LineIcon line={line} />
                <span className="flex-1 text-sm font-medium">
                  {fmtGBP(line.amount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {lineLabel(line)}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  disabled={pending}
                  aria-label="Remove entry"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rag-red"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing logged yet today. Add your first entry above.
          </p>
        )}

        {/* Today so far */}
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cash / Card today</span>
            <span className="font-medium">
              {fmtGBP(todayCash)} / {fmtGBP(todayCard)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tips today (100% yours)</span>
            <span className="font-medium">{fmtGBP(todayTips)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              No-shows today (awaiting sign-off)
            </span>
            <span className="font-medium">{fmtGBP(todayNoShows)}</span>
          </div>
        </div>

        {/* This week — running totals so the barber always knows what's theirs */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-border px-4 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            This week so far
          </p>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Revenue (split with the business)</span>
            <span className="font-semibold">{fmtGBP(weekTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tips — 100% yours</span>
            <span className="font-semibold text-rag-green">{fmtGBP(weekTips)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              No-shows (awaiting sign-off)
            </span>
            <span className="font-medium">{fmtGBP(weekNoShows)}</span>
          </div>
          <p className="mt-1 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
            You keep 100% of your tips on top of your share of revenue. No-shows
            only count once your manager confirms payment at weekly sign-off.
          </p>
        </div>
      </div>
    </Card>
  )
}

function LineIcon({ line }: { line: TakingsLine }) {
  if (line.kind === "tip")
    return <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
  if (line.kind === "no_show")
    return <UserX className="h-4 w-4 shrink-0 text-muted-foreground" />
  return line.method === "card" ? (
    <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
  ) : (
    <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
  )
}

function lineLabel(line: TakingsLine): string {
  if (line.kind === "tip") return "Tip"
  if (line.kind === "no_show") {
    if (line.noShowPaid === true) return "No-show · paid"
    if (line.noShowPaid === false) return "No-show · not paid"
    return "No-show · pending"
  }
  return line.method === "card" ? "Card" : "Cash"
}
