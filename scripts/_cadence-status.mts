import { getCadenceStatus } from "@/lib/weekly-workflow"
import { getSubmissionStatus } from "@/lib/submissions"

const week = "2026-08-29"
const s = await getCadenceStatus(week)
const sub = await getSubmissionStatus(week)
console.log("[v0] stage:", s.stage)
console.log("[v0] analysisRunAt:", s.analysisRunAt)
console.log("[v0] cosminNarrativeAt:", s.cosminNarrativeAt)
console.log("[v0] martinResponseAt:", s.martinResponseAt)
console.log("[v0] finalAnalysisAt:", s.finalAnalysisAt)
console.log("[v0] reportSentAt:", s.reportSentAt)
console.log("[v0] submission complete?", sub.complete, "outstanding:", sub.outstandingCount)
