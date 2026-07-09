"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Check, X, Clock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { acceptProposedAction, dismissProposedAction } from "@/app/actions/governance"
import type { ActionRow } from "@/lib/data"

/**
 * AI "strategic coach" proposals. The weekly RAID analysis files draft actions
 * as status "Proposed"; they don't count toward the live register until a
 * leader accepts them here. Accept promotes to Open; Dismiss deletes the draft.
 */
export function ProposedActionsPanel({ proposed }: { proposed: ActionRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (proposed.length === 0) return null

  function act(
    fn: typeof acceptProposedAction | typeof dismissProposedAction,
    id: number,
  ) {
    const fd = new FormData()
    fd.set("id", String(id))
    startTransition(async () => {
      await fn(fd)
      router.refresh()
    })
  }

  return (
    <Card className="border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            AI-proposed actions ({proposed.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Drafted by the weekly strategic-coach analysis. Accept to add to the
            live register, or dismiss.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {proposed.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{a.title}</p>
              {a.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.description}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                  {a.functionArea}
                </span>
                <span>Owner: {a.ownerLabel}</span>
                <span>Priority: {a.priority}</span>
                {a.dueDate && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due {a.dueDate}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="default"
                disabled={pending}
                onClick={() => act(acceptProposedAction, a.id)}
                className="h-8"
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => act(dismissProposedAction, a.id)}
                className="h-8"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
