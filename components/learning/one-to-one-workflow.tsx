"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { ScorePicker, PbcGuide, pbcScoreLabel } from "@/components/learning/pbc-scale"
import {
  ONE_TO_ONE_QUESTIONS,
  ONE_TO_ONE_GROUPS,
  PBC_DIMENSIONS,
  suggestPbcFromAnswers,
  type OneToOneAnswers,
  type PbcDimension,
  type SelfPrep,
} from "@/lib/learning-types"
import { openOneToOneAction, completeOneToOneAction } from "@/app/learning/actions"
import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle2 } from "lucide-react"

type Props = {
  barberId: number
  barberName: string
  oneToOneId: number | null
  status: string // None | Scheduled | Completed
  period: string
  selfPrep: SelfPrep
  managerAnswersInit: OneToOneAnswers
  summaryInit: string | null
  actionsInit: string | null
}

/**
 * Two-stage monthly 1-2-1:
 *  1. The barber self-scores (read-only here, shown alongside).
 *  2. The manager answers + scores; any dimension where the manager's score
 *     differs from the barber's self-score requires a reason.
 * Completing writes the PBC rating for the period and emails both parties.
 */
export function OneToOneWorkflow(props: Props) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  if (props.status === "None" || props.oneToOneId == null) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No 1-2-1 open for this period. Open one so {props.barberName.split(" ")[0]} can complete their
          self-prep first.
        </p>
        <Button
          className="mt-3"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await openOneToOneAction(props.barberId)
              setMsg(res.ok ? "1-2-1 opened — the barber can now self-prep." : "Could not open 1-2-1.")
            })
          }
        >
          {isPending ? "Opening…" : "Open 1-2-1 for this period"}
        </Button>
        {msg ? <p className="mt-2 text-sm text-muted-foreground">{msg}</p> : null}
      </div>
    )
  }

  const completed = props.status === "Completed"
  return (
    <TwoStageForm {...props} completed={completed} oneToOneId={props.oneToOneId} />
  )
}

function TwoStageForm(props: Props & { completed: boolean; oneToOneId: number }) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const self = props.selfPrep ?? {}
  const selfAnswers = self.answers ?? {}
  const selfScores: Record<PbcDimension, number | null> = {
    performance: self.selfPerformance ?? null,
    behaviours: self.selfBehaviours ?? null,
    contribution: self.selfContribution ?? null,
  }
  const selfSubmitted = Boolean(self.submittedAt)

  const [answers, setAnswers] = useState<OneToOneAnswers>(props.managerAnswersInit ?? {})
  const suggested = useMemo(() => suggestPbcFromAnswers(answers), [answers])

  // Manager PBC scores (default to suggestion from their own answers).
  const [scores, setScores] = useState<Record<PbcDimension, number | null>>({
    performance: null,
    behaviours: null,
    contribution: null,
  })
  const [reason, setReason] = useState("")
  const [summary, setSummary] = useState(props.summaryInit ?? "")
  const [actions, setActions] = useState(props.actionsInit ?? "")

  function effScore(dim: PbcDimension) {
    return scores[dim] ?? suggested[dim]
  }

  // Which dimensions differ from the barber's self-score?
  const differences = PBC_DIMENSIONS.filter((d) => {
    const selfS = selfScores[d.key]
    return selfS != null && selfS !== effScore(d.key)
  })
  const needsReason = differences.length > 0 && reason.trim().length === 0

  const overall = Math.min(
    5,
    Math.max(1, Math.round((effScore("performance") + effScore("behaviours") + effScore("contribution")) / 3)),
  )

  function setAnswer(id: string, value: number | boolean | string) {
    setAnswers((a) => ({ ...a, [id]: value }))
  }

  if (props.completed) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="size-5" />
          <p className="text-sm font-semibold">This 1-2-1 is complete for {props.period}.</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          See the PBC history tab for the recorded scores and trend.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!selfSubmitted ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {props.barberName.split(" ")[0]} hasn&apos;t submitted their self-prep yet. You can still run
            the 1-2-1, but the self-scores below will be blank.
          </p>
        </div>
      ) : null}

      {/* Questions grouped, showing self answer + manager answer */}
      {ONE_TO_ONE_GROUPS.map((group) => (
        <section key={group} className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">{group}</h3>
          <div className="mt-3 space-y-4">
            {ONE_TO_ONE_QUESTIONS.filter((q) => q.group === group).map((q) => (
              <div key={q.id} className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">{q.prompt}</p>
                {q.help ? <p className="text-xs text-muted-foreground">{q.help}</p> : null}
                {selfSubmitted ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Self:</span> {renderAnswer(selfAnswers[q.id])}
                  </p>
                ) : null}
                <AnswerInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Two-stage PBC scoring */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">PBC scoring</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The barber&apos;s self-score is shown for each dimension. Set your manager score; where they
          differ you must explain why.
        </p>
        <div className="mt-4 space-y-5">
          {PBC_DIMENSIONS.map((d) => {
            const selfS = selfScores[d.key]
            const mgr = effScore(d.key)
            const differ = selfS != null && selfS !== mgr
            return (
              <div key={d.key} className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium text-foreground">{d.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Self: <span className="font-medium tabular-nums">{selfS ?? "—"}</span>
                    {selfS ? ` (${pbcScoreLabel(selfS)})` : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{d.blurb}</p>
                <ScorePicker value={mgr} onChange={(s) => setScores((sc) => ({ ...sc, [d.key]: s }))} />
                {differ ? (
                  <p className="text-xs font-medium text-amber-700">
                    Differs from self-score — add a reason below.
                  </p>
                ) : null}
              </div>
            )
          })}

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium text-foreground">
              Overall: <span className="tabular-nums">{overall}</span> — {pbcScoreLabel(overall)}
            </p>
          </div>

          {differences.length > 0 ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">
                Reason for difference ({differences.map((d) => d.label).join(", ")})
                <span className="text-destructive"> *</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                placeholder="Explain why your score differs from the self-assessment."
              />
            </label>
          ) : null}
        </div>
      </section>

      {/* Summary + actions */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Summary</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
            placeholder="Key discussion points and agreements."
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Agreed actions</span>
          <textarea
            value={actions}
            onChange={(e) => setActions(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
            placeholder="What will happen before the next 1-2-1."
          />
        </label>
      </section>

      <PbcGuide />

      <div className="flex items-center gap-3">
        <Button
          disabled={isPending || needsReason}
          onClick={() =>
            startTransition(async () => {
              const res = await completeOneToOneAction({
                oneToOneId: props.oneToOneId,
                barberId: props.barberId,
                managerAnswers: answers,
                performance: effScore("performance"),
                behaviours: effScore("behaviours"),
                contribution: effScore("contribution"),
                overall,
                summary: summary || null,
                actions: actions || null,
                differenceReason: reason || null,
              })
              setMsg(res.ok ? "1-2-1 completed and PBC recorded." : "Could not complete — check permissions.")
            })
          }
        >
          {isPending ? "Saving…" : "Complete 1-2-1 & record PBC"}
        </Button>
        {needsReason ? (
          <p className="text-xs text-amber-700">Add a reason for the differing score to continue.</p>
        ) : null}
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      </div>
    </div>
  )
}

function AnswerInput({
  q,
  value,
  onChange,
}: {
  q: (typeof ONE_TO_ONE_QUESTIONS)[number]
  value: number | boolean | string | null | undefined
  onChange: (v: number | boolean | string) => void
}) {
  if (q.type === "rating") {
    return <ScorePicker value={typeof value === "number" ? value : null} onChange={(s) => onChange(s)} />
  }
  if (q.type === "yesno") {
    const yes = value === true
    const no = value === false
    return (
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={yes ? "default" : "outline"} onClick={() => onChange(true)}>
          Yes
        </Button>
        <Button type="button" size="sm" variant={no ? "default" : "outline"} onClick={() => onChange(false)}>
          No
        </Button>
      </div>
    )
  }
  return (
    <textarea
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
    />
  )
}

function renderAnswer(v: number | boolean | string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (typeof v === "number") return `${v} (${pbcScoreLabel(v)})`
  return v
}
