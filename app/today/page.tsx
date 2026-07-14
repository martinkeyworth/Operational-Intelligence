import Link from "next/link"
import { ChevronRight, CheckCircle2, LayoutDashboard } from "lucide-react"
import { requireUser } from "@/lib/access"
import { getTodayForBarber } from "@/lib/today"
import { TodayInputCard } from "@/components/today/today-input-card"
import { SignOutButton } from "@/components/sign-out-button"
import { fmtDate } from "@/lib/format"

export const metadata = {
  title: "Today · LTZ",
  description: "Log today's takings and see what needs your attention.",
}

const ragDot: Record<string, string> = {
  red: "bg-rag-red",
  amber: "bg-rag-amber",
  green: "bg-rag-green",
}

export default async function TodayPage() {
  const user = await requireUser()
  const data = await getTodayForBarber(user)

  const firstName = data.barberName.trim().split(/\s+/)[0] || "there"
  const outstanding = data.items.filter((i) => i.rag !== "green")
  const done = data.items.filter((i) => i.rag === "green")

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-balance">
            Hi {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.outstandingCount === 0
              ? "You're all caught up."
              : `${data.outstandingCount} thing${data.outstandingCount === 1 ? "" : "s"} need your attention.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/start"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">Switch view</span>
          </Link>
          <SignOutButton />
        </div>
      </header>

      <TodayInputCard
        dateLabel={fmtDate(data.date)}
        lines={data.todayLines}
        todayCash={data.todayCash}
        todayCard={data.todayCard}
        weekTotal={data.weekTotal}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Your outstanding actions
        </h2>

        {outstanding.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-rag-green/30 bg-rag-green/10 px-4 py-3 text-sm text-rag-green">
            <CheckCircle2 className="h-4 w-4" />
            Nothing outstanding — nice work.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {outstanding.map((item, i) => (
              <li key={`${item.kind}-${i}`}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
                >
                  <span
                    className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${ragDot[item.rag]}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <ul className="flex flex-col gap-2 opacity-70">
            {done.map((item, i) => (
              <li
                key={`done-${item.kind}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${ragDot[item.rag]}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-rag-green" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
