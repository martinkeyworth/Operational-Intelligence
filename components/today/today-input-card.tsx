"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  Banknote,
  CreditCard,
  Plus,
  Trash2,
  UserX,
  Coins,
  Scissors,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { fmtGBP } from "@/lib/format"
import { addTakingsLine, deleteTakingsLine } from "@/app/today/actions"
import type { TakingsLine, TakingsKind } from "@/lib/daily-takings"
import type { TodayWeekDay } from "@/lib/today"

type Method = "cash" | "card"

const KINDS: { key: TakingsKind; label: string; icon: typeof Scissors }[] = [
  { key: "cut", label: "Cut", icon: Scissors },
  { key: "no_show", label: "No-show", icon: UserX },
  { key: "tip", label: "Tip", icon: Coins },
]

export function TodayInputCard({
  selectedDate,
  today,
  dateLabel,
  weekDays,
  weekConfirmed,
  lines,
  dayCash,
  dayCard,
  dayTips,
  dayNoShows,
  weekTotal,
  weekTips,
  weekNoShows,
}: {
  selectedDate: string
  today: string
  dateLabel: string
  weekDays: TodayWeekDay[]
  weekConfirmed: boolean
  lines: TakingsLine[]
  dayCash: number
  dayCard: number
  dayTips: number
  dayNoShows: number
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

  const isToday = selectedDate === today
  const locked = weekConfirmed

  // Revenue = cuts only. No-shows are auto-charged to card (awaiting sign-off);
  // tips are 100% the barber's.
  const dayRevenue = dayCash + dayCard

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
    fd.set("date", selectedDate)
    // No-shows auto-charge to card; tips carry no method; cuts use the toggle.
    fd.set("method", kind === "no_show" ? "card" : method)
    startTransition(async () => {
      const res = await addTakingsLine(fd)
      if (res && res.ok === false && res.error) {
        setError(res.error)
        return
      }
      setAmount("")
      router.refresh()
    })
  }

  function removeLine(id: number) {
    const fd = new FormData()
    fd.set("id", String(id))
    fd.set("date", selectedDate)
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
            <h2 className="text-lg font-semibold">
              {isToday ? "Today's takings" : "Takings"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {dateLabel} · log each cut, no-show and tip
            </p>
          </div>
          <span className="text-right">
            <span className="block text-xs text-muted-foreground">
              {isToday ? "Revenue today" : "Revenue"}
            </span>
            <span className="block text-lg font-semibold">
              {fmtGBP(dayRevenue)}
            </span>
          </span>
        </div>

        {/* Day picker — jump to any day of the current week to back-fill */}
        <div className="flex flex-wrap gap-1.5">
          {weekDays.map((d) => {
            const active = d.date === selectedDate
            return (
              <Link
                key={d.date}
                href={d.isToday ? "/today" : `/today?day=${d.date}`}
                scroll={false}
                aria-current={active ? "date" : undefined}
                className={`flex min-w-11 flex-col items-center rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                <span className="font-medium">{d.isToday ? "Today" : d.weekday}</span>
                <span className="flex items-center gap-1">
                  {d.dayNum}
                  {d.hasEntries && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        active ? "bg-primary-foreground" : "bg-rag-green"
                      }`}
                      aria-hidden
                    />
                  )}
                </span>
              </Link>
            )
          })}
        </div>

        {locked ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              This week has been signed off by your manager, so takings are
              locked. Speak to your manager if something needs changing.
            </span>
          </div>
        ) : (
          <>
            {!isToday && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                You&apos;re editing an earlier day this week. Add anything that was
                missed — it&apos;ll roll into this week&apos;s totals.
              </p>
            )}

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
          </>
        )}

        {/* The selected day's entries */}
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
                {!locked && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    disabled={pending}
                    aria-label="Remove entry"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rag-red"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {isToday
              ? "Nothing logged yet today. Add your first entry above."
              : "Nothing logged on this day."}
          </p>
        )}

        {/* Selected day so far */}
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Cash / Card {isToday ? "today" : "this day"}
            </span>
            <span className="font-medium">
              {fmtGBP(dayCash)} / {fmtGBP(dayCard)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Tips {isToday ? "today" : "this day"} (100% yours)
            </span>
            <span className="font-medium">{fmtGBP(dayTips)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              No-shows {isToday ? "today" : "this day"} (awaiting sign-off)
            </span>
            <span className="font-medium">{fmtGBP(dayNoShows)}</span>
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
