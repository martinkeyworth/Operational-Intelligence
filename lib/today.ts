import "server-only"
import { ensureBarberForUser } from "@/lib/team"
import {
  getBarberDailyWeek,
  getBarberLinesForDate,
  type TakingsLine,
} from "@/lib/daily-takings"
import { getCurrentOneToOne, getPlanForBarber } from "@/lib/learning"
import { getMyWork } from "@/lib/my-work"
import { getCycleForPeriod, getCycleProgress } from "@/lib/three-sixty"
import { currentPeriod } from "@/lib/learning-types"
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
  todayTips: number
  todayNoShows: number
  todayLines: TakingsLine[]
  enteredToday: boolean
  weekCash: number
  weekCard: number
  weekTotal: number
  weekTips: number
  weekNoShows: number
  /** Barber's take-home guide: revenue split + 100% of tips. */
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

  // Revenue = cut lines only (by method). Tips + no-shows are tracked apart:
  // no-shows are unconfirmed until weekly sign-off, tips never split.
  const cuts = todayLines.filter((l) => l.kind === "cut")
  const todayCash = cuts
    .filter((l) => l.method === "cash")
    .reduce((s, l) => s + l.amount, 0)
  const todayCard = cuts
    .filter((l) => l.method === "card")
    .reduce((s, l) => s + l.amount, 0)
  const todayTips = todayLines
    .filter((l) => l.kind === "tip")
    .reduce((s, l) => s + l.amount, 0)
  const todayNoShows = todayLines
    .filter((l) => l.kind === "no_show")
    .reduce((s, l) => s + l.amount, 0)
  const enteredToday = todayLines.length > 0

  const weekCash = days.reduce((s, d) => s + d.cash, 0)
  const weekCard = days.reduce((s, d) => s + d.card, 0)
  const weekTips = days.reduce((s, d) => s + d.tips, 0)
  const weekNoShows = days.reduce((s, d) => s + d.unconfirmedNoShows, 0)

  const items: TodayItem[] = []

  // 1. Today's takings — the primary prompt. Green once at least one cut is in.
  items.push(
    enteredToday
      ? {
          kind: "takings-today",
          label: "Today's takings",
          detail: `${todayLines.length} entr${todayLines.length === 1 ? "y" : "ies"} logged today. Add cuts, no-shows and tips above as you go.`,
          rag: "green",
          href: "#today-input",
        }
      : {
          kind: "takings-today",
          label: "Log today's takings",
          detail: "Add each cut, no-show and tip above as it happens.",
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

  // 2b. This barber's 360 for the current period — they must nominate 5
  //     reviewers, and their feedback drives the PBC rating. If the window
  //     closes with nobody nominated the PBC defaults to the lowest score, so
  //     surfacing this here is important.
  try {
    const cycle = await getCycleForPeriod(barber.id, currentPeriod())
    if (cycle && cycle.status === "Open") {
      const { nominated } = await getCycleProgress(cycle.id)
      const overdue = cycle.dueOn != null && String(cycle.dueOn) < date
      if (nominated === 0) {
        items.push({
          kind: "three-sixty",
          label: "Nominate your 360 reviewers",
          detail: overdue
            ? "Overdue — pick 5 people to give feedback for your review. Without this your rating defaults to the lowest score."
            : "Pick 5 people to give feedback for your review — their input drives your PBC rating.",
          rag: overdue ? "red" : "amber",
          href: "/team#three-sixty",
        })
      } else if (nominated < 5) {
        items.push({
          kind: "three-sixty",
          label: "Finish nominating your 360 reviewers",
          detail: `${nominated}/5 nominated. Add the rest so their feedback can shape your review.`,
          rag: overdue ? "red" : "amber",
          href: "/team#three-sixty",
        })
      } else {
        items.push({
          kind: "three-sixty",
          label: "360 reviewers nominated",
          detail: "All 5 reviewers are invited. Their feedback feeds your review.",
          rag: "green",
          href: "/team#three-sixty",
        })
      }
    }
  } catch {
    // No cycle / lookup issue — simply nothing to prompt here.
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
    todayTips,
    todayNoShows,
    todayLines,
    enteredToday,
    weekCash,
    weekCard,
    weekTotal: weekCash + weekCard,
    weekTips,
    weekNoShows,
    items,
    outstandingCount,
  }
}
