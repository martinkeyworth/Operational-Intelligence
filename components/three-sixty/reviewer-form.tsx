"use client"

import { useState, useTransition } from "react"
import { ScorePicker } from "@/components/learning/pbc-scale"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitReviewerFeedbackAction } from "@/app/360/actions"

// Reviewer-friendly framing of the three PBC dimensions (1 = excellent, 5 = needs work).
const DIMENSIONS: { key: "performance" | "behaviours" | "contribution"; label: string; hint: string }[] = [
  {
    key: "performance",
    label: "Quality of their work",
    hint: "How well they deliver — skill, consistency and results.",
  },
  {
    key: "behaviours",
    label: "How they work with others",
    hint: "Attitude, reliability, teamwork and living the values.",
  },
  {
    key: "contribution",
    label: "Wider contribution",
    hint: "Helping others, sharing ideas and lifting the team/shop.",
  },
]

export function ReviewerForm({ token, barberName }: { token: string; barberName: string }) {
  const [scores, setScores] = useState<Record<string, number>>({})
  const [relationship, setRelationship] = useState("")
  const [strengths, setStrengths] = useState("")
  const [improvements, setImprovements] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  const allScored = DIMENSIONS.every((d) => scores[d.key])

  function submit() {
    setError(null)
    if (!allScored) {
      setError("Please give a score for each of the three areas.")
      return
    }
    startTransition(async () => {
      const res = await submitReviewerFeedbackAction({
        token,
        performance: scores.performance,
        behaviours: scores.behaviours,
        contribution: scores.contribution,
        relationship,
        strengths,
        improvements,
      })
      if (res.ok) setDone(true)
      else setError(res.error ?? "Something went wrong. Please try again.")
    })
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
        <p className="text-sm leading-relaxed">
          Thank you — your feedback for {barberName} has been submitted. It will be combined
          confidentially with others to support their review.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Score each area from <strong>1 (excellent)</strong> to <strong>5 (needs work)</strong>. Be
          honest and fair — your individual answers are not shown to {barberName}.
        </p>
      </div>

      {DIMENSIONS.map((d) => (
        <div key={d.key} className="space-y-2">
          <div>
            <Label className="text-sm font-medium">{d.label}</Label>
            <p className="text-xs text-muted-foreground leading-relaxed">{d.hint}</p>
          </div>
          <ScorePicker value={scores[d.key]} onChange={(s) => setScores((p) => ({ ...p, [d.key]: s }))} />
        </div>
      ))}

      <div className="space-y-2">
        <Label htmlFor="relationship" className="text-sm font-medium">
          How do you work with {barberName}? <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="relationship"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          placeholder="e.g. We work the same floor / I manage them / I'm a regular client"
          className="min-h-16 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="strengths" className="text-sm font-medium">
          What are they great at? <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="strengths"
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          className="min-h-20 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="improvements" className="text-sm font-medium">
          Where could they improve? <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="improvements"
          value={improvements}
          onChange={(e) => setImprovements(e.target.value)}
          className="min-h-20 text-base"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button onClick={submit} disabled={pending} className="w-full min-h-11 text-base">
        {pending ? "Submitting…" : "Submit feedback"}
      </Button>
    </div>
  )
}
