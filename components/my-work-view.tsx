import Link from "next/link"
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  PartyPopper,
  ClipboardEdit,
  UserX,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtDate } from "@/lib/format"
import { Card } from "@/components/ui/card"
import type { MyWork, MyWorkItem, MyWorkReason } from "@/lib/my-work"

const REASON_STYLES: Record<
  MyWorkReason,
  { label: string; className: string; Icon: typeof Clock }
> = {
  Overdue: {
    label: "Overdue",
    className: "bg-rag-red/15 text-rag-red",
    Icon: Clock,
  },
  "Due soon": {
    label: "Due soon",
    className: "bg-rag-amber/15 text-rag-amber",
    Icon: Clock,
  },
  "Needs an owner": {
    label: "Needs an owner",
    className: "bg-muted text-muted-foreground",
    Icon: UserX,
  },
  Open: {
    label: "To do",
    className: "bg-muted text-muted-foreground",
    Icon: ClipboardEdit,
  },
}

function ReasonChip({ reason }: { reason: MyWorkReason }) {
  const { label, className, Icon } = REASON_STYLES[reason]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

function WorkRow({ item }: { item: MyWorkItem }) {
  return (
    <Link
      href={`/governance?tab=actions&focus=${item.id}`}
      className="group flex items-stretch gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-accent/40 min-h-11"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground text-pretty">{item.title}</p>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.areaLabel}
          {item.siteName ? ` · ${item.siteName}` : ""}
          {" · "}
          {item.entryType}
          {item.dueDate ? (
            <>
              {" · "}
              <span className={cn(item.overdue && "text-rag-red font-medium")}>
                {item.overdue
                  ? `${item.daysOverdue}d overdue`
                  : `due ${fmtDate(item.dueDate)}`}
              </span>
            </>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.reasons.map((r) => (
            <ReasonChip key={r} reason={r} />
          ))}
        </div>
      </div>
    </Link>
  )
}

function Section({
  title,
  hint,
  items,
}: {
  title: string
  hint: string
  items: MyWorkItem[]
}) {
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <WorkRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

export function MyWorkView({
  userName,
  work,
  showFullView = false,
}: {
  userName: string
  work: MyWork
  showFullView?: boolean
}) {
  const firstName = userName.split(" ")[0]

  if (work.totalCount === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rag-green/15">
          <PartyPopper className="h-8 w-8 text-rag-green" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-foreground text-balance">
          Congratulations, {firstName} — nothing needs your attention right now.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
          You&apos;re all caught up. Nothing is assigned to you that&apos;s still
          open, and your weekly inputs are in. New items will appear here the
          moment they need you.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/governance?tab=actions"
            className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            View action register
          </Link>
          <Link
            href="/data-entry"
            className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Weekly takings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">
            Your work, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {work.totalCount} {work.totalCount === 1 ? "item" : "items"} to do
            {work.weekLabel ? ` · week ending ${work.weekLabel}` : ""}
          </p>
        </div>
        {showFullView && (
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Full leadership view
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      <Section
        title="Assigned to you"
        hint="Everything you own that's still open"
        items={work.assigned}
      />

      <Section
        title="In your areas"
        hint="Not yet assigned to anyone"
        items={work.watch}
      />

      {work.submissions.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Weekly inputs outstanding</h2>
            <span className="text-xs text-muted-foreground">Due this week</span>
          </div>
          <div className="flex flex-col gap-2">
            {work.submissions.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-accent/40 min-h-11"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rag-amber/15">
                  <ClipboardEdit className="h-4 w-4 text-rag-amber" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <Card className="flex items-center gap-3 border-dashed bg-muted/30 p-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-rag-green" />
        <p className="text-xs text-muted-foreground text-pretty">
          Once you&apos;ve cleared these, this page will tell you you&apos;re all caught up.
        </p>
      </Card>
    </div>
  )
}
