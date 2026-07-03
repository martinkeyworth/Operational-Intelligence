// Role-guide content library.
//
// Produces a single, combined "how to use the dashboard" guide for a person,
// merging every role they hold (base barbering role + leadership dashboard +
// L&D management + each functional area they lead) into one ordered set of
// sections. People with dual/multiple roles get ONE message that stitches all
// of their responsibilities together, deduped.
//
// Client-safe: no server-only imports. Both the in-app Team Area panel and the
// server-side email builder import from here so the wording stays identical.

import { FUNCTION_AREAS } from "@/lib/function-areas"

export type GuideSection = {
  id: string
  title: string
  // One or two sentences: what this part of the site is and does.
  whatItDoes: string
  // The concrete things this person needs to do here.
  youDo: string[]
  // When / how often, in plain English.
  cadence: string
}

export type PersonRoleInput = {
  name: string
  email: string
  // barbers.role — "Manager" | "Barber" | "Apprentice" (free text tolerated).
  baseRole: string
  isApprentice: boolean
  canViewDashboard: boolean
  isBarber: boolean
  isTrainingLead: boolean
  isHrLead: boolean
  isSocialMedia: boolean
  // Functional-area keys this person leads (Capacity, RTB, HR, ...).
  leadAreas: string[]
}

export type PersonGuide = {
  name: string
  firstName: string
  // Human-readable list of every role/hat this person wears.
  roleLabels: string[]
  sections: GuideSection[]
}

const areaLabel = (key: string): string =>
  FUNCTION_AREAS.find((a) => a.key === key)?.label ?? key

const areaDescription = (key: string): string =>
  FUNCTION_AREAS.find((a) => a.key === key)?.description ?? ""

// ---------------------------------------------------------------------------
// Universal section — everyone gets this, whatever their role.
// ---------------------------------------------------------------------------
function everyoneSection(): GuideSection {
  return {
    id: "getting-started",
    title: "Getting started — your Team Area",
    whatItDoes:
      "The dashboard is the single place the group runs on. When you sign in you land on your Team Area: your personal home for takings, holidays, sickness and your development. You only ever see what's relevant to you.",
    youDo: [
      "Sign in with your email. Forgot your password? Use the 'Forgot password' link to reset it yourself.",
      "Check the banner at the top of your Team Area — it tells you if this week's takings are still due.",
      "Book holiday and log sickness from your Team Area; requests go to the right manager automatically.",
    ],
    cadence: "Sign in whenever you need to — at minimum weekly to submit your takings.",
  }
}

// ---------------------------------------------------------------------------
// Base barbering-role sections.
// ---------------------------------------------------------------------------
function weeklyTakingsSection(): GuideSection {
  return {
    id: "weekly-takings",
    title: "Your weekly takings",
    whatItDoes:
      "Your takings are what the whole revenue picture is built from. The Team Area charts your weekly total against your RTB target so you can see how you're tracking.",
    youDo: [
      "Submit your takings every week from the 'Submit takings' button.",
      "Check your RTB chart to see whether you're above or below target.",
    ],
    cadence: "Every week, before the week closes.",
  }
}

function developmentSection(): GuideSection {
  return {
    id: "development",
    title: "Your monthly review — 360, 1-2-1 and PBC",
    whatItDoes:
      "Each month you get a 360 feedback cycle, a 1-2-1 with your manager, and a PBC score (Performance, Behaviours, Contribution). The 360 feedback and your own self-prep feed an AI draft of your PBC, which your manager reviews with you.",
    youDo: [
      "When a 360 opens, nominate 5 people to give you feedback — do this promptly so responses are in before your 1-2-1.",
      "Fill in your self-prep before the 1-2-1: rate yourself on Performance, Behaviours and Contribution and add your reasons.",
      "Work through your development plan and keep your course progress up to date.",
    ],
    cadence: "Monthly. You'll be emailed when your 360 opens and when your 1-2-1 is scheduled.",
  }
}

function apprenticeSection(): GuideSection {
  return {
    id: "apprentice",
    title: "Your apprenticeship",
    whatItDoes:
      "As an apprentice your Team Area also tracks your 3-month cutting & revenue gate and your training milestones, so you and your trainer can see your progress toward qualifying.",
    youDo: [
      "Keep an eye on your 3-month gate banner and aim to be cutting and earning by then.",
      "Complete your academy coursework and training milestones in your development plan.",
      "Use your monthly 1-2-1 to raise anything you need support with.",
    ],
    cadence: "Ongoing, with milestones reviewed in your monthly 1-2-1.",
  }
}

// ---------------------------------------------------------------------------
// Management / leadership sections.
// ---------------------------------------------------------------------------
function managerTeamSection(): GuideSection {
  return {
    id: "manage-team",
    title: "Running your team's reviews",
    whatItDoes:
      "For the people who report to you, Learning Plans is where you run the monthly cycle. Each person's page shows their 360 progress, their self-prep, an AI-drafted PBC and their development plan.",
    youDo: [
      "Open Learning Plans to see your team's roster, their 1-2-1 status and 360 progress.",
      "Once a person's 360 is 'Ready', open their 1-2-1, generate the AI PBC, then review and adjust the scores before completing.",
      "Agree actions in the 1-2-1 and keep their development plan moving.",
      "Chase anyone whose takings or self-prep are outstanding — you can re-send a 1-2-1 invite from their row.",
    ],
    cadence: "Monthly per team member, plus a quick weekly check that takings are in.",
  }
}

function dashboardSection(): GuideSection {
  return {
    id: "dashboard",
    title: "The leadership dashboard",
    whatItDoes:
      "You have access to the group dashboard: the Group Overview (the most recent completed week), Sites, Reports and the action register. It rolls every shop's numbers into one RAG-rated picture.",
    youDo: [
      "Start on the Group Overview to see how the group performed last week.",
      "Drill into Sites and Reports for detail behind any red or amber flag.",
      "Keep the action register moving for anything you own.",
    ],
    cadence: "Weekly, ahead of the operational meeting.",
  }
}

function learningManagerSection(): GuideSection {
  return {
    id: "ld-manager",
    title: "Learning & Development (you manage L&D)",
    whatItDoes:
      "You own the L&D system: the course catalogue, the role requirements/gates, and every barber's development plan. Course Catalogue defines what each role must complete; Learning Plans is where plans are built and reviewed.",
    youDo: [
      "Keep the Course Catalogue and role requirements current so plans stay accurate.",
      "Make sure every barber has an up-to-date plan against their target role.",
      "Support managers running 1-2-1s and step in on PBC where needed.",
    ],
    cadence: "Ongoing, with a monthly review alongside the 1-2-1 cycle.",
  }
}

// ---------------------------------------------------------------------------
// Per-functional-area lead section.
// ---------------------------------------------------------------------------
function areaSection(areaKey: string): GuideSection {
  const label = areaLabel(areaKey)
  const desc = areaDescription(areaKey)
  return {
    id: `area-${areaKey}`,
    title: `You lead ${label}`,
    whatItDoes:
      `You're the accountable lead for ${label}. ${desc} The area page shows its KPIs, trend and RAID log (risks, issues and actions).`.trim(),
    youDo: [
      `Open the ${label} area page and keep its KPIs updated.`,
      `Log and work through risks, issues and actions in the ${label} RAID log.`,
      `Be ready to explain any red/amber flag in ${label} at the operational meeting.`,
    ],
    cadence: "Weekly review; update KPIs and actions as things change.",
  }
}

// ---------------------------------------------------------------------------
// Composition — merge every hat this person wears into one guide.
// ---------------------------------------------------------------------------

/** Effective set of functional-area keys this person leads, merging the
 *  leadAreas list with the legacy capability flags (deduped). */
export function effectiveLeadAreas(p: PersonRoleInput): string[] {
  const set = new Set<string>(p.leadAreas)
  if (p.isHrLead) set.add("HR")
  if (p.isTrainingLead) set.add("Training")
  if (p.isSocialMedia) set.add("Marketing")
  // Preserve the canonical ordering from FUNCTION_AREAS.
  return FUNCTION_AREAS.map((a) => a.key).filter((k) => set.has(k))
}

function roleLabelsFor(p: PersonRoleInput, areas: string[]): string[] {
  const labels: string[] = []
  const base = (p.baseRole || "").trim()
  if (p.isApprentice || /apprentice/i.test(base)) labels.push("Apprentice Barber")
  else if (/manager/i.test(base)) labels.push("Manager")
  else labels.push("Barber")
  if (p.canViewDashboard) labels.push("Leadership")
  const managesLd = p.isTrainingLead || p.leadAreas.includes("Training")
  if (managesLd) labels.push("L&D Manager")
  for (const a of areas) labels.push(`${areaLabel(a)} Lead`)
  // Dedupe while preserving order.
  return Array.from(new Set(labels))
}

/** Build the single combined guide for a person, stitching all their roles. */
export function buildPersonGuide(p: PersonRoleInput): PersonGuide {
  const base = (p.baseRole || "").trim()
  const isApprentice = p.isApprentice || /apprentice/i.test(base)
  const isManager = /manager/i.test(base)
  const areas = effectiveLeadAreas(p)
  const managesLd = p.isTrainingLead || p.leadAreas.includes("Training")

  const sections: GuideSection[] = []
  // 1. Universal intro.
  sections.push(everyoneSection())
  // 2. Weekly takings (anyone who cuts hair / is a barber record).
  if (p.isBarber) sections.push(weeklyTakingsSection())
  // 3. Base-role development.
  if (isApprentice) sections.push(apprenticeSection())
  sections.push(developmentSection())
  // 4. Manager: running their team's reviews.
  if (isManager) sections.push(managerTeamSection())
  // 5. Leadership dashboard.
  if (p.canViewDashboard) sections.push(dashboardSection())
  // 6. L&D management.
  if (managesLd) sections.push(learningManagerSection())
  // 7. One section per functional area they lead.
  for (const a of areas) sections.push(areaSection(a))

  return {
    name: p.name,
    firstName: p.name.split(" ")[0] || p.name,
    roleLabels: roleLabelsFor(p, areas),
    sections,
  }
}
