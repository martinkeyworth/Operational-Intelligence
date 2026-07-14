import "server-only"
import { ensureBarberForUser } from "@/lib/team"
import {
  getBarberDailyWeek,
  getBarberLinesForDate,
  type TakingsLine,
} from "@/lib/daily-takings"
import { getCurrentOneToOne, getPlanForBarber } from "@/lib/learning"
import { getMyWork } from "@/lib/my-work"
import { weekEndingFor, weekDates, todayIso } from "@/lib/format"
import type { AccessUser } from "@/lib/access-types"

// ---------------------------------------------------------------------------
// The "Today" screen: what a barber sees on login if they pick Daily input.
// Two things only — (1) enter TODAY's cash + card, and (2) a personal RAG of
// their own outstanding obligations (takings, weekly confirmation, KPIs, L&D,
// 1-2-1, and any RAID actions assigned to them), each linking to where it's
// resolved. No wider dashboard noise.
// ---------------------------------------------------------------------------

export type TodayRag = "red" | "amber" | "green"

export type TodayItem = {
  kind: string
  label: string
  detail: string
  rag: TodayRag
  href: string
}

export type TodayData = {
  barberId: number
  barberName: string
  siteId: number
  date: string
  weekEnding: string
  todayCash: number
  todayCard: number
  todayLines: TakingsLine[]
  enteredToday: boolean
  weekCash: number
  weekCard: number
  weekTotal: number
  items: TodayItem[]
  outstandingCount: number
}

/** Assemble the Today screen for the signed-in user (barber-centric). */
export async function getTodayForBarber(user: AccessUser): Promise<TodayData> {
  const barber = await ensureBarberForUser({
    id: user.id,
    name: user.name,
    email: user.email,
  })

  const date = todayIso()
  const weekEnding = weekEndingFor(date)
  const days = await getBarberDailyWeek(barber.id, weekEnding)
  const todayLines = await getBarberLinesForDate(barber.id, date)

  const todayCash = todayLines
    .filter((l) => l.method === "cash")
    .reduce((s, l) => s + l.amount, 0)
  const todayCard = todayLines
    .filter((l) => l.method === "card")
    .reduce((s, l) => s + l.amount, 0)
  const enteredToday = todayLines.length > 0

  const weekCash = days.reduce((s, d) => s + d.cash, 0)
  const weekCard = days.reduce((s, d) => s + d.card, 0)

  const items: TodayItem[] = []

  // 1. Today's takings — the primary prompt. Green once at least one cut is in.
  items.push(
    enteredToday
      ? {
          kind: "takings-today",
          label: "Today's takings",
          detail: `${todayLines.length} cut${todayLines.length === 1 ? "" : "s"} logged today. Add more above as you go.`,
          rag: "green",
          href: "#today-input",
        }
      : {
          kind: "takings-today",
          label: "Log today's takings",
          detail: "Add each cut above as it's paid.",
          rag: "amber",
          href: "#today-input",
        },
  )

  // 2. This barber's own 1-2-1 for the current period.
  const oneToOne = await getCurrentOneToOne(barber.id)
  if (!oneToOne) {
    items.push({
      kind: "one-to-one",
      label: "Monthly 1-2-1",
      detail: "Not scheduled yet for this month.",
      rag: "amber",
      href: "/team",
    })
  } else if (oneToOne.status !== "Completed") {
    const overdue =
      oneToOne.dueOn != null && String(oneToOne.dueOn) < date
    // Barber's own prep still to do?
    const prepDone = oneToOne.selfPrep != null
    items.push({
      kind: "one-to-one",
      label: prepDone ? "1-2-1 booked" : "Prep for your 1-2-1",
      detail: prepDone
        ? "Your self-prep is in. Awaiting your 1-2-1."
        : "Add your self-prep and self-scoring before your 1-2-1.",
      rag: overdue ? "red" : prepDone ? "green" : "amber",
      href: "/team",
    })
  }

  // 3. This barber's L&D plan review.
  try {
    const plan = await getPlanForBarber(barber.id)
    if (plan.reviewDue) {
      items.push({
        kind: "ld-review",
        label: "Development plan review",
        detail: "Your learning plan is due a review.",
        rag: "amber",
        href: "/team",
      })
    }
  } catch {
    // A barber without a plan yet simply has nothing to show here.
  }

  // 4. RAID actions assigned to me + weekly submissions for any role I hold.
  //    getMyWork already scopes these to the signed-in user.
  const work = await getMyWork(user)
  for (const a of work.assigned) {
    items.push({
      kind: "action",
      label: a.title,
      detail: `${a.areaLabel}${a.siteName ? ` · ${a.siteName}` : ""} — ${a.reasons.join(", ")}`,
      rag: a.rag === "red" ? "red" : "amber",
      href: "/governance?tab=actions",
    })
  }
  for (const s of work.submissions) {
    items.push({
      kind: "submission",
      label: s.label,
      detail: s.detail,
      rag: "amber",
      href: s.href,
    })
  }

  const outstandingCount = items.filter((i) => i.rag !== "green").length

  return {
    barberId: barber.id,
    barberName: barber.name,
    siteId: barber.siteId,
    date,
    weekEnding,
    todayCash,
    todayCard,
    todayLines,
    enteredToday,
    weekCash,
    weekCard,
    weekTotal: weekCash + weekCard,
    items,
    outstandingCount,
  }
}
