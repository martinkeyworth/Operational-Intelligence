"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { PersonGuide } from "@/lib/role-guide"
import { BookOpen, ChevronDown, Clock } from "lucide-react"

/**
 * "Your guide to the dashboard" — the same combined, multi-role guide that gets
 * emailed, shown in the Team Area. Sections are collapsible; the first one is
 * open by default so there's always something visible.
 */
export function RoleGuidePanel({ guide }: { guide: PersonGuide }) {
  const [open, setOpen] = useState<string | null>(guide.sections[0]?.id ?? null)

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="size-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Your guide to the dashboard</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground text-pretty">
            How the site works and what you need to do — built for your role
            {guide.roleLabels.length > 1 ? "s" : ""}.
          </p>
          {guide.roleLabels.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {guide.roleLabels.map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {r}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 divide-y divide-border border-t border-border">
        {guide.sections.map((s) => {
          const isOpen = open === s.id
          return (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 py-3 text-left"
              >
                <span className="text-sm font-medium text-foreground text-pretty">{s.title}</span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen ? (
                <div className="pb-4">
                  <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                    {s.whatItDoes}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {s.youDo.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-foreground">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="leading-relaxed text-pretty">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="size-3.5" />
                    {s.cadence}
                  </p>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
