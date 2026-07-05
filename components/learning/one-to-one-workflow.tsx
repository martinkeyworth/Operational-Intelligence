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
import { openOneToOneAction, completeOneToOneAction, generateAiPbcAction } from "@/app/learning/actions"
import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, Users } from "lucide-react"

export type ThreeSixtyStatus = {
  nominated: number
  responded: number
  threshold: number
  ready: boolean
  lowConfidence: boolean
  hasCycle: boolean
}

export type AiPbcSuggestion = {
  performance: number
  behaviours: number
  contribution: number
  overall: number
  rationale: string
  lowConfidence: boolean
}

export type ComplianceSummary = {
  flags: string[]
  clean: boolean
  raidAttributable: boolean
}

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
  threeSixty: ThreeSixtyStatus
  aiPbc: AiPbcSuggestion | null
  compliance: ComplianceSummary
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
      <div className="space-y-4">
        <ThreeSixtyPanel status={props.threeSixty} barberName={props.barberName} />
        <CompliancePanel compliance={props.compliance} barberName={props.barberName} />
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {props.threeSixty.ready
              ? `The 360 is ready. Open the 1-2-1 so ${props.barberName.split(" ")[0]} can complete their self-prep and the AI can draft the PBC.`
              : `No 1-2-1 open for this period. You can open it now, but the 360 feedback that drives the PBC isn't in yet.`}
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

  // The AI's PBC suggestion (from the 360 + self-prep + KPIs) is the starting
  // point. The manager can override any dimension before completing.
  const [ai, setAi] = useState<AiPbcSuggestion | null>(props.aiPbc)
  const [aiPending, startAiTransition] = useTransition()
  const [aiMsg, setAiMsg] = useState<string | null>(null)

  // Manager PBC scores default to the AI suggestion (auto-set), else null.
  const [scores, setScores] = useState<Record<PbcDimension, number | null>>({
    performance: props.aiPbc?.performance ?? null,
    behaviours: props.aiPbc?.behaviours ?? null,
    contribution: props.aiPbc?.contribution ?? null,
  })
  const [reason, setReason] = useState("")
  const [summary, setSummary] = useState(props.summaryInit ?? "")
  const [actions, setActions] = useState(props.actionsInit ?? "")

  // Effective score: manager override, else AI suggestion, else answer-derived.
  function effScore(dim: PbcDimension) {
    return scores[dim] ?? ai?.[dim] ?? suggested[dim]
  }

  function runAiAnalysis() {
    startAiTransition(async () => {
      const res = await generateAiPbcAction(props.barberId)
      if (res.ok && res.ai) {
        const next: AiPbcSuggestion = {
          performance: Number(res.ai.performance),
          behaviours: Number(res.ai.behaviours),
          contribution: Number(res.ai.contribution),
          overall: Number(res.ai.overall),
          rationale: String(res.ai.rationale ?? ""),
          lowConfidence: Boolean(res.ai.lowConfidence),
        }
        setAi(next)
        // Auto-fill manager scores with the fresh AI suggestion.
        setScores({
          performance: next.performance,
          behaviours: next.behaviours,
          contribution: next.contribution,
        })
        setAiMsg("AI PBC generated from the 360 feedback. Review and adjust if needed.")
      } else {
        setAiMsg(res.error ?? "Could not generate the AI analysis.")
      }
    })
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
      <ThreeSixtyPanel status={props.threeSixty} barberName={props.barberName} />
      <CompliancePanel compliance={props.compliance} barberName={props.barberName} />

      {/* AI PBC analysis — auto-set from the 360, editable by the manager. */}
      <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">AI PBC analysis</h3>
          </div>
          <Button size="sm" variant="outline" disabled={aiPending} onClick={runAiAnalysis}>
            {aiPending ? "Analysing…" : ai ? "Regenerate" : "Generate from 360"}
          </Button>
        </div>
        {ai ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {PBC_DIMENSIONS.map((d) => (
                <span
                  key={d.key}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium tabular-nums"
                >
                  {d.label}: {ai[d.key]} ({pbcScoreLabel(ai[d.key])})
                </span>
              ))}
              <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums">
                Overall: {ai.overall} ({pbcScoreLabel(ai.overall)})
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{ai.rationale}</p>
            {ai.lowConfidence ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="size-3.5" />
                Low confidence — fewer than {props.threeSixty.threshold} reviewers responded. Treat as
                indicative and rely on your judgement.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              These scores pre-fill your PBC below. Adjust any that you disagree with.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Generate an AI-drafted PBC from the 360 feedback, the self-prep and KPI signals. You&apos;ll be
            able to override it before completing.
          </p>
        )}
        {aiMsg ? <p className="mt-2 text-sm text-muted-foreground">{aiMsg}</p> : null}
      </section>

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

/**
 * Read-only card showing the auto-compiled operational-compliance signals
 * (missed/late confirmations, excess/stale red RAID, overdue tasks) that the
 * AI weighs into the PBC. Green when clean, amber when there are flags.
 */
function CompliancePanel({
  compliance,
  barberName,
}: {
  compliance: ComplianceSummary
  barberName: string
}) {
  const clean = compliance.clean
  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        clean ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-center gap-2">
        {clean ? (
          <CheckCircle2 className="size-4 text-emerald-600" />
        ) : (
          <ShieldAlert className="size-4 text-amber-600" />
        )}
        <h3 className="text-sm font-semibold text-foreground">Compliance signals (auto-compiled)</h3>
      </div>
      {clean ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No operational-compliance concerns for {barberName.split(" ")[0]} in the last 12 weeks —
          confirmations on time, no excess or stale red RAID, no overdue tasks.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            System-recorded over the last 12 weeks. These feed the AI PBC and weigh on Behaviours &
            Contribution before you start.
          </p>
          <ul className="mt-2 space-y-1.5">
            {compliance.flags.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!compliance.raidAttributable ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Note: this person has no linked login, so RAID ownership couldn&apos;t be checked — only
          weekly confirmations are included.
        </p>
      ) : null}
    </section>
  )
}

/** Shows 360 feedback progress and whether it's unlocked this month's review. */
function ThreeSixtyPanel({ status, barberName }: { status: ThreeSixtyStatus; barberName: string }) {
  if (!status.hasCycle) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          No 360 cycle is open for {barberName.split(" ")[0]} this period yet. It normally opens
          automatically — the 360 feedback is a key input to the PBC.
        </p>
      </div>
    )
  }
  const pct = status.nominated > 0 ? Math.round((status.responded / status.nominated) * 100) : 0
  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        status.ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">360 feedback</h3>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            status.ready ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground",
          )}
        >
          {status.ready ? "Ready for review" : "Collecting"}
        </span>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {status.responded} of {status.nominated || 5} responded
          </span>
          <span>Need {status.threshold} to unlock</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", status.ready ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {status.lowConfidence ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="size-3.5" />
          Window closed with fewer than {status.threshold} responses — the AI will flag low confidence.
        </p>
      ) : null}
    </section>
  )
}
