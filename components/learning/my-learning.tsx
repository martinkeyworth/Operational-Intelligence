"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScorePicker, PbcGuide, pbcScoreLabel } from "@/components/learning/pbc-scale"
import { PbcHistory, type PbcHistoryRow } from "@/components/learning/pbc-history"
import {
  ONE_TO_ONE_QUESTIONS,
  ONE_TO_ONE_GROUPS,
  PBC_DIMENSIONS,
  formatPeriod,
  suggestPbcFromAnswers,
  type OneToOneAnswers,
  type PbcDimension,
  type SelfPrep,
} from "@/lib/learning-types"
import { saveMySelfPrep, addMyPlanItem, updateMyPlanItem, saveMyPlanMeta } from "@/app/team/learning-actions"
import { CheckCircle2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

type PlanItem = {
  id: number
  courseTitle: string | null
  title: string | null
  status: string
  targetDate: string | null
}

export type MyLearningData = {
  targetRoleTitle: string
  aspiration: string | null
  progressPct: number
  items: PlanItem[]
  requiredCourses: { course: { id: number; title: string }; met: boolean }[]
  pbcHistory: PbcHistoryRow[]
  oneToOne: {
    id: number | null
    status: string
    period: string
    selfPrep: SelfPrep
  }
}

/** The barber's own development area: 1-2-1 self-prep, plan, PBC history. */
export function MyLearning({ data }: { data: MyLearningData }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">My development</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your 1-2-1 self-prep, development plan and PBC history.
      </p>
      <Tabs defaultValue="oneToOne" className="mt-4">
        <TabsList>
          <TabsTrigger value="oneToOne">1-2-1 self-prep</TabsTrigger>
          <TabsTrigger value="plan">My plan</TabsTrigger>
          <TabsTrigger value="pbc">PBC history</TabsTrigger>
        </TabsList>
        <TabsContent value="oneToOne" className="pt-4">
          <SelfPrepForm oneToOne={data.oneToOne} />
        </TabsContent>
        <TabsContent value="plan" className="pt-4">
          <MyPlan data={data} />
        </TabsContent>
        <TabsContent value="pbc" className="pt-4">
          <PbcHistory history={data.pbcHistory} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function SelfPrepForm({ oneToOne }: { oneToOne: MyLearningData["oneToOne"] }) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const locked = oneToOne.status === "Completed"
  const noneOpen = oneToOne.id == null || oneToOne.status === "None"

  const init = oneToOne.selfPrep ?? {}
  const [answers, setAnswers] = useState<OneToOneAnswers>(init.answers ?? {})
  const [scores, setScores] = useState<Record<PbcDimension, number | null>>({
    performance: init.selfPerformance ?? null,
    behaviours: init.selfBehaviours ?? null,
    contribution: init.selfContribution ?? null,
  })
  const [reason, setReason] = useState(init.selfReason ?? "")
  const suggested = useMemo(() => suggestPbcFromAnswers(answers), [answers])

  if (noneOpen) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No 1-2-1 is open yet. Your manager will open this month&apos;s 1-2-1 — you&apos;ll then be able to
        self-assess here before you meet.
      </p>
    )
  }

  function setAnswer(id: string, value: number | boolean | string) {
    setAnswers((a) => ({ ...a, [id]: value }))
  }
  function eff(dim: PbcDimension) {
    return scores[dim] ?? suggested[dim]
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-sm text-foreground">
          {locked ? "Completed" : "In progress"} — {formatPeriod(oneToOne.period)}
        </p>
        <p className="text-xs text-muted-foreground">
          Complete this before your 1-2-1. Your manager will see your answers and self-scores.
        </p>
      </div>

      {ONE_TO_ONE_GROUPS.map((group) => (
        <section key={group} className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">{group}</h3>
          <div className="mt-3 space-y-4">
            {ONE_TO_ONE_QUESTIONS.filter((q) => q.group === group).map((q) => (
              <div key={q.id} className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">{q.prompt}</p>
                {q.help ? <p className="text-xs text-muted-foreground">{q.help}</p> : null}
                {q.type === "rating" ? (
                  <ScorePicker
                    value={typeof answers[q.id] === "number" ? (answers[q.id] as number) : null}
                    onChange={(s) => setAnswer(q.id, s)}
                    disabled={locked}
                  />
                ) : q.type === "yesno" ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={answers[q.id] === true ? "default" : "outline"}
                      disabled={locked}
                      onClick={() => setAnswer(q.id, true)}
                    >
                      Yes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={answers[q.id] === false ? "default" : "outline"}
                      disabled={locked}
                      onClick={() => setAnswer(q.id, false)}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <textarea
                    value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    disabled={locked}
                    rows={2}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Self PBC scores */}
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">Your self-assessment (PBC)</h3>
        <p className="mt-1 text-xs text-muted-foreground">Score yourself 1 (best) to 5 (lowest).</p>
        <div className="mt-4 space-y-4">
          {PBC_DIMENSIONS.map((d) => (
            <div key={d.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-foreground">{d.label}</p>
                <p className="text-xs text-muted-foreground">{pbcScoreLabel(eff(d.key))}</p>
              </div>
              <ScorePicker
                value={eff(d.key)}
                onChange={(s) => setScores((sc) => ({ ...sc, [d.key]: s }))}
                disabled={locked}
              />
            </div>
          ))}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Reasons / evidence (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={locked}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="Why you scored yourself this way."
            />
          </label>
        </div>
      </section>

      <PbcGuide />

      {!locked ? (
        <div className="flex items-center gap-3">
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const res = await saveMySelfPrep({
                  answers,
                  selfPerformance: eff("performance"),
                  selfBehaviours: eff("behaviours"),
                  selfContribution: eff("contribution"),
                  selfReason: reason || null,
                })
                setMsg(res.ok ? "Self-prep saved." : "Could not save.")
              })
            }
          >
            {isPending ? "Saving…" : "Save self-prep"}
          </Button>
          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function MyPlan({ data }: { data: MyLearningData }) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState("")
  const [aspiration, setAspiration] = useState(data.aspiration ?? "")

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Target: {data.targetRoleTitle}</p>
          <span className="text-sm tabular-nums text-muted-foreground">{data.progressPct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${data.progressPct}%` }} />
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium text-foreground">My aspiration</span>
          <div className="flex gap-2">
            <input
              value={aspiration}
              onChange={(e) => setAspiration(e.target.value)}
              className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="Where I want to get to"
            />
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => startTransition(async () => void (await saveMyPlanMeta({ aspiration })))}
            >
              Save
            </Button>
          </div>
        </label>
      </div>

      {data.requiredCourses.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-semibold text-foreground">Requirements for {data.targetRoleTitle}</p>
          <ul className="mt-2 space-y-1.5">
            {data.requiredCourses.map((rc) => (
              <li key={rc.course.id} className="flex items-center gap-2 text-sm">
                {rc.met ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={cn(rc.met ? "text-foreground" : "text-muted-foreground")}>
                  {rc.course.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-semibold text-foreground">My actions</p>
        <ul className="mt-2 space-y-2">
          {data.items.length === 0 ? (
            <li className="text-sm text-muted-foreground">No actions yet.</li>
          ) : null}
          {data.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm text-foreground">{item.courseTitle ?? item.title}</p>
                {item.targetDate ? (
                  <p className="text-xs text-muted-foreground">Target: {item.targetDate}</p>
                ) : null}
              </div>
              {item.status !== "complete" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => void (await updateMyPlanItem({ itemId: item.id, status: "complete" })))
                  }
                >
                  Mark done
                </Button>
              ) : (
                <span className="text-xs font-medium text-emerald-600">Complete</span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a development action"
            className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            disabled={isPending || !title.trim()}
            onClick={() =>
              startTransition(async () => {
                await addMyPlanItem({ title })
                setTitle("")
              })
            }
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
