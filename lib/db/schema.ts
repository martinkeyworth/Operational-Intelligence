import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  numeric,
  date,
  unique,
  jsonb,
} from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("viewer"),
  // Access capabilities. Company-domain users default to dashboard access;
  // everyone else is a barber (weekly data input only).
  canViewDashboard: boolean("can_view_dashboard").notNull().default(false),
  isBarber: boolean("is_barber").notNull().default(false),
  isTrainingLead: boolean("is_training_lead").notNull().default(false),
  isHrLead: boolean("is_hr_lead").notNull().default(false),
  isSocialMedia: boolean("is_social_media").notNull().default(false),
  // Comma-separated functional-area keys this user leads (e.g. "Capacity,RTB").
  // A lead can manage their own area's RAID log. Generalises the per-flag leads
  // above to all six areas (Capacity, RTB, Subletting, Training, HR, Marketing).
  leadAreas: text("lead_areas").notNull().default(""),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// --- LTZ Group governance tables -------------------------------------------

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  brand: text("brand").notNull().default("Less Than Zero"),
  region: text("region"),
  managerName: text("manager_name"),
  // Confirmed staff headcount for the site (editable on the site record).
  headcount: integer("headcount").notNull().default(0),
  openedDate: date("opened_date"),
  monthlyTarget: numeric("monthly_target").notNull().default("0"),
  rag: text("rag").notNull().default("green"),
  // Site type drives which capacity KPIs apply.
  siteType: text("site_type").notNull().default("barbershop"), // barbershop | training
  // Barbershop CAPACITY: the most barbers the site could ever support.
  chairCapacity: integer("chair_capacity").notNull().default(0),
  // Physical chairs installed at the site (between capacity and barbers).
  chairs: integer("chairs").notNull().default(0),
  // Weekly Revenue-To-Business assumption per barber (£).
  rtbPerBarber: numeric("rtb_per_barber").notNull().default("500"),
  // Training capacity: weekly private learners and apprentices.
  learnerCapacity: integer("learner_capacity").notNull().default(0),
  apprenticeCapacity: integer("apprentice_capacity").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const barbers = pgTable("barbers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  siteId: integer("site_id").notNull(),
  role: text("role").notNull().default("Barber"),
  targetRevenuePerDay: numeric("target_revenue_per_day").notNull().default("250"),
  targetWeekly: numeric("target_weekly").notNull().default("800"),
  active: boolean("active").notNull().default(true),
  // Profit-split: the barber's % share of their takings (business takes the
  // remainder). Set/confirmed by Martin or Cosmin in the secure Split area
  // once a barber has loaded their first week of data, then reviewed weekly.
  // Null = not yet set (falls back to the group default).
  barberPct: numeric("barber_pct"),
  splitSetBy: text("split_set_by"),
  splitSetAt: timestamp("split_set_at"),
  // Per-barber weekly cap on how much RTB (house rent) may be taken from CARD.
  // Anything above the cap is driven onto cash (see lib/rtb.ts). Default £200.
  cardRtbCap: numeric("card_rtb_cap").notNull().default("200"),
  // Discrepancy-detection thresholds (lib/discrepancies.ts). Null = use the
  // system default. swingThresholdPct: ± % vs trailing average that trips a
  // "big swing" flag. expectedWorkingDays: days expected for a "full" week.
  swingThresholdPct: numeric("swing_threshold_pct"),
  expectedWorkingDays: integer("expected_working_days"),
  // --- Team Area: links + HR profile -----------------------------------
  // Links this operational barber record to their Better Auth login account,
  // so a logged-in barber sees only their own self-service data. Null until an
  // admin links them in the Team Area.
  userId: text("user_id"),
  // The user account of the manager who runs this barber's monthly 1-2-1s.
  managerUserId: text("manager_user_id"),
  // Apprentices are tracked against a 3-month "cutting + earning revenue" gate.
  isApprentice: boolean("is_apprentice").notNull().default(false),
  // Employment start date (drives apprentice 3-month gate + service length).
  startDate: date("start_date"),
  // Annual holiday entitlement in days (statutory default 28).
  holidayAllowance: integer("holiday_allowance").notNull().default(28),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Weekly barber takings (Saturday-to-Saturday). The core operating data.
export const weeklyTakings = pgTable(
  "weekly_takings",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id").notNull(),
    siteId: integer("site_id").notNull(),
    weekEnding: date("week_ending").notNull(),
    total: numeric("total").notNull().default("0"),
    cash: numeric("cash").notNull().default("0"),
    card: numeric("card").notNull().default("0"),
    cashRent: numeric("cash_rent").notNull().default("0"),
    cardRent: numeric("card_rent").notNull().default("0"),
    manager: text("manager").notNull().default(""),
    transferCompleted: boolean("transfer_completed").notNull().default(true),
    comments: text("comments"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    key: unique("weekly_takings_barber_week").on(t.barberId, t.weekEnding),
  }),
)

// Per-barber, per-DAY takings. Barbers log each day's cash + card total (via a
// separate entry app that POSTs into /api/ingest/daily-takings). This app
// tallies the days into the weekly_takings rollup and computes RTB from the
// split (lib/rtb.ts). One row per barber per date (re-sends upsert).
export const dailyTakings = pgTable(
  "daily_takings",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id").notNull(),
    siteId: integer("site_id").notNull(),
    date: date("date").notNull(),
    cash: numeric("cash").notNull().default("0"),
    card: numeric("card").notNull().default("0"),
    // Where the row came from (entry app, manual admin, import, ...).
    source: text("source").notNull().default("entry-app"),
    // The authenticated user who entered it (the barber, via the entry app).
    enteredByUserId: text("entered_by_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    key: unique("daily_takings_barber_date").on(t.barberId, t.date),
  }),
)

// One row per haircut. Barbers add a line as each cut is paid; the day's lines
// are summed (by method) into the daily_takings row, which in turn drives the
// weekly rollup + RTB. Lines are only editable for the current day.
export const takingsLineEntries = pgTable("takings_line_entries", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull(),
  siteId: integer("site_id").notNull(),
  date: date("date").notNull(),
  amount: numeric("amount").notNull().default("0"),
  method: text("method").notNull().default("cash"), // 'cash' | 'card'
  enteredByUserId: text("entered_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Weekly functional-leader confirmation of each site's details.
// Mario's weekly sign-off that all social/marketing activity (every site + HR
// + Training) has been reviewed. One row per week-ending. Entering figures is
// separate from confirming them, mirroring the site/training confirmation flow.
export const marketingConfirmations = pgTable("marketing_confirmations", {
  id: serial("id").primaryKey(),
  weekEnding: date("week_ending").notNull().unique(),
  confirmed: boolean("confirmed").notNull().default(false),
  confirmedBy: text("confirmed_by"),
  confirmedByName: text("confirmed_by_name"),
  notes: text("notes"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const siteConfirmations = pgTable("site_confirmations", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull(),
  weekEnding: date("week_ending").notNull(),
  confirmed: boolean("confirmed").notNull().default(false),
  confirmedBy: text("confirmed_by"),
  confirmedRole: text("confirmed_role"),
  siteNameConfirmed: text("site_name_confirmed"),
  locationConfirmed: text("location_confirmed"),
  brandConfirmed: text("brand_confirmed"),
  managerConfirmed: text("manager_confirmed"),
  headcountConfirmed: integer("headcount_confirmed"),
  notes: text("notes"),
  // Manager's per-barber, per-flag accept/refuse decisions on takings/RTB
  // discrepancies at sign-off. Shape: { [barberId]: { [flagKind]: "accepted"
  // | "refused" } }. Null until a confirmation with flags is saved.
  discrepancyState: jsonb("discrepancy_state"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const revenueEntries = pgTable("revenue_entries", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull(),
  siteId: integer("site_id").notNull(),
  entryDate: date("entry_date").notNull(),
  revenue: numeric("revenue").notNull().default("0"),
  servicesCount: integer("services_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const kpis = pgTable("kpis", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  functionArea: text("function_area").notNull(),
  unit: text("unit").notNull().default(""),
  greenThreshold: numeric("green_threshold"),
  amberThreshold: numeric("amber_threshold"),
  direction: text("direction").notNull().default("higher_better"),
  frequency: text("frequency").notNull().default("Weekly"),
  ownerRole: text("owner_role").notNull(),
  // Single named accountable owner for the KPI (in addition to the role).
  ownerName: text("owner_name").notNull().default(""),
  escalationRule: text("escalation_rule"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const kpiValues = pgTable("kpi_values", {
  id: serial("id").primaryKey(),
  kpiId: integer("kpi_id").notNull(),
  siteId: integer("site_id"),
  // Optional brand scope. Per-brand KPIs (e.g. Marketing & Social) store one
  // row per brand per week; group-level KPIs leave this null.
  brand: text("brand"),
  period: text("period").notNull(),
  value: numeric("value").notNull().default("0"),
  rag: text("rag").notNull().default("green"),
  commentary: text("commentary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const actions = pgTable("actions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  functionArea: text("function_area").notNull(),
  // RAID log classification: 'Risk' (potential threat), 'Issue' (current
  // problem) or 'Action' (task). All three roll up by RAG to the dashboard.
  entryType: text("entry_type").notNull().default("Action"),
  siteId: integer("site_id"),
  owner: text("owner").notNull(),
  // Optional link to the responsible user account (the assigned owner). Risks
  // assigned to an owner feed Cosmin's weekly operational meeting view.
  ownerUserId: text("owner_user_id"),
  // The user who raised the entry (area lead or owner).
  createdByUserId: text("created_by_user_id"),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Open"),
  // Stored RAG. With auto-RAG this is treated as a cached/last value; the
  // effective colour is computed unless `ragOverride` pins it manually.
  rag: text("rag").notNull().default("amber"),
  // Manual RAG pin. NULL = auto-calculate from age, priority, KPI and the 5x5
  // (Strategy) rule. A value ('red'|'amber'|'green') forces that colour.
  ragOverride: text("rag_override"),
  dueDate: date("due_date"),
  escalated: boolean("escalated").notNull().default(false),
  // Auto-escalation tracking. `escalatedAt` is set when an action is escalated
  // (manually or by the auto-escalation engine); `autoEscalated` marks engine-
  // driven escalations; `escalationReason` records why.
  escalatedAt: timestamp("escalated_at"),
  escalationReason: text("escalation_reason"),
  autoEscalated: boolean("auto_escalated").notNull().default(false),
  // Flags this action as a risk for the weekly operational meeting register.
  isRisk: boolean("is_risk").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// Weekly subletting income (e.g. chair/room rent) per site. Used for the
// Cavendish subletting KPI: target £950/week, anything below is red and
// triggers a quarterly review action.
export const sublettingTakings = pgTable("subletting_takings", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull(),
  weekEnding: date("week_ending").notNull(),
  amount: numeric("amount").notNull().default("0"),
  // Weekly target for this site's subletting income.
  target: numeric("target").notNull().default("950"),
  recordedBy: text("recorded_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Weekly training throughput for academy sites. Targets come from the site's
// learnerCapacity / apprenticeCapacity; below either is red.
export const trainingWeeks = pgTable("training_weeks", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull(),
  weekEnding: date("week_ending").notNull(),
  privateLearners: integer("private_learners").notNull().default(0),
  apprentices: integer("apprentices").notNull().default(0),
  recordedBy: text("recorded_by"),
  notes: text("notes"),
  // Explicit weekly confirmation for the training site (entering figures is
  // separate from confirming them). Drives the outstanding/escalation flow.
  confirmed: boolean("confirmed").notNull().default(false),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  })

// Weekly board pack: AI analysis + leadership narratives + send status. One
// row per week-ending. Drives the Saturday reporting workflow.
export const weeklyReports = pgTable("weekly_reports", {
  id: serial("id").primaryKey(),
  weekEnding: date("week_ending").notNull().unique(),
  overallRag: text("overall_rag"),
  overallPct: integer("overall_pct"),
  // Structured snapshot of every area's RAG/score at analysis time (JSON).
  snapshot: text("snapshot"),
  // AI week-on-week analysis (improving / static / declining per KPI area).
  aiAnalysis: text("ai_analysis"),
  // Narrative supplied by Cosmin (COO) at the 7pm step.
  cosminNarrative: text("cosmin_narrative"),
  cosminNarrativeAt: timestamp("cosmin_narrative_at"),
  // Martin's (CEO) response at the 8:30pm step.
  martinResponse: text("martin_response"),
  martinResponseAt: timestamp("martin_response_at"),
  // Workflow timestamps.
  remindersSentAt: timestamp("reminders_sent_at"),
  // 18:00 leadership "who hasn't submitted yet" alert.
  submissionAlertSentAt: timestamp("submission_alert_sent_at"),
  // 18:00 urgent "confirm/submit your outstanding items" prompt to the
  // responsible site manager / area lead.
  confirmPromptSentAt: timestamp("confirm_prompt_sent_at"),
  // 19:00 escalation to owners for anything still outstanding an hour later.
  confirmEscalatedAt: timestamp("confirm_escalated_at"),
  // Weekly AI "strategic coach" systemic-issue analysis of the RAID log.
  raidAiSentAt: timestamp("raid_ai_sent_at"),
  analysisRunAt: timestamp("analysis_run_at"),
  reportSentAt: timestamp("report_sent_at"),
  // Event-driven cadence (process-, not time-, gated). Marker for when all
  // collection/confirmation was first complete (stage 1 gate).
  collectionCompleteAt: timestamp("collection_complete_at"),
  // Final AI "wrap-around" synthesis folding the upfront analysis + COO
  // narrative + CEO response, generated just before the board report.
  finalAnalysis: text("final_analysis"),
  finalAnalysisAt: timestamp("final_analysis_at"),
  // Chase bookkeeping for the orchestrator (mirrors discrepancy_state jsonb):
  // { narrativeRequestedAt, narrativeLastChaseAt, narrativeEscalatedAt,
  //   responseRequestedAt, responseLastChaseAt, responseEscalatedAt }.
  cadenceState: jsonb("cadence_state"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Audit log of every outbound email the system sends.
export const emailLog = pgTable("email_log", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // reminder | narrative_request | board_report
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  weekEnding: date("week_ending"),
  status: text("status").notNull().default("sent"), // sent | failed
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// --- Governance: Decision Register -----------------------------------------
// Completes the RAID model (Risk/Issue/Action live in the actions table; this
// is the D). Records what was decided, by whom, when and why.
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  context: text("context"),
  decision: text("decision").notNull(),
  rationale: text("rationale"),
  functionArea: text("function_area").notNull(),
  siteId: integer("site_id"),
  decidedBy: text("decided_by").notNull(),
  decidedByUserId: text("decided_by_user_id"),
  createdByUserId: text("created_by_user_id"),
  status: text("status").notNull().default("Active"), // Active | Superseded | Reversed
  reviewDate: date("review_date"),
  decidedOn: date("decided_on").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// --- Recruitment funnel (end-to-end) ---------------------------------------
// Tracks a candidate from first contact through to hire. Stages:
// Contacted -> Interview -> Offer -> Hired (or Rejected/Withdrawn via status).
export const recruitmentCandidates = pgTable("recruitment_candidates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("Barber"),
  siteId: integer("site_id"),
  source: text("source"),
  stage: text("stage").notNull().default("Contacted"), // Contacted | Interview | Offer | Hired
  status: text("status").notNull().default("Active"), // Active | Rejected | Withdrawn
  ownerUserId: text("owner_user_id"),
  contactedOn: date("contacted_on").notNull().defaultNow(),
  interviewOn: date("interview_on"),
  offerOn: date("offer_on"),
  hiredOn: date("hired_on"),
  lastFollowUpOn: date("last_follow_up_on"),
  followUpCount: integer("follow_up_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// --- Training funnel (end-to-end) ------------------------------------------
// Tracks an academy learner from enquiry to placement. Stages:
// Enquiry -> Enrolled -> Completed -> Placed (into a chair).
export const trainingLearners = pgTable("training_learners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  program: text("program").notNull().default("Academy"),
  siteId: integer("site_id"),
  stage: text("stage").notNull().default("Enquiry"), // Enquiry | Enrolled | Completed | Placed
  status: text("status").notNull().default("Active"), // Active | Dropped
  ownerUserId: text("owner_user_id"),
  enquiryOn: date("enquiry_on").notNull().defaultNow(),
  enrolledOn: date("enrolled_on"),
  completedOn: date("completed_on"),
  placedOn: date("placed_on"),
  placedSiteId: integer("placed_site_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// --- Behaviour / activity tracking -----------------------------------------
// Leading indicators (effort), as opposed to outcomes. e.g. posts made,
// recruitment contacts, follow-ups, interviews booked. One row per
// area+type+site+week.
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  functionArea: text("function_area").notNull(),
  activityType: text("activity_type").notNull(),
  siteId: integer("site_id"),
  userId: text("user_id"),
  weekEnding: date("week_ending").notNull(),
  count: integer("count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// --- Team Area: HR self-service --------------------------------------------
// Holiday + sickness records for a barber. `kind` distinguishes the two so we
// can run separate KPIs: holiday counts down from the 28-day allowance;
// sickness days accumulate (0-4 green / 5 amber / 6+ red).
export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull(),
  kind: text("kind").notNull().default("holiday"), // holiday | sickness
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: integer("days").notNull().default(1),
  // holiday: Pending | Approved | Declined; sickness is logged as Recorded.
  status: text("status").notNull().default("Pending"),
  reason: text("reason"),
  // Calendar year the days count against (for holiday allowance + sickness KPI).
  leaveYear: integer("leave_year").notNull(),
  requestedByUserId: text("requested_by_user_id"),
  decidedByUserId: text("decided_by_user_id"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Monthly 1-2-1 between a barber and their assigned manager. Auto-scheduled
// once a month; `.ics` invite emailed to barber + manager on creation.
export const oneToOnes = pgTable("one_to_ones", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull(),
  managerUserId: text("manager_user_id"),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: text("status").notNull().default("Scheduled"), // Scheduled | Completed | Missed
  autoScheduled: boolean("auto_scheduled").notNull().default(true),
  inviteSentAt: timestamp("invite_sent_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  // Google Calendar sync: the event id on the shared calendar, plus the latest
  // RSVP response read back from Google for each attendee.
  googleEventId: text("google_event_id"),
  calendarSyncedAt: timestamp("calendar_synced_at"),
  barberResponse: text("barber_response").notNull().default("needsAction"), // needsAction | accepted | declined | tentative
  managerResponse: text("manager_response").notNull().default("needsAction"),
  rsvpSyncedAt: timestamp("rsvp_synced_at"),
  // --- Structured monthly 1-2-1 (drives PBC + L&D review) ------------------
  // YYYY-MM derived from scheduledFor; links this 1-2-1 to a PBC period.
  period: text("period"),
  templateVersion: integer("template_version"),
  // The barber's pre-1-2-1 answers. Also holds their self-scored PBC
  // (selfPerformance/selfBehaviours/selfContribution + reasons) for the
  // two-stage self-then-manager scoring flow.
  selfPrep: jsonb("self_prep"),
  // The manager's answers, incl. their reason where their score differs from
  // the barber's self-score.
  managerAnswers: jsonb("manager_answers"),
  summary: text("summary"),
  actions: text("actions"),
  // Manager's provisional PBC scores captured on this 1-2-1 (1 best - 5 lowest).
  pbcPerformance: integer("pbc_performance"),
  pbcBehaviours: integer("pbc_behaviours"),
  pbcContribution: integer("pbc_contribution"),
  // AI-generated PBC analysis (from the 360 + self-prep + KPIs) that pre-fills
  // the manager's scores. Shape: { performance, behaviours, contribution,
  // overall, rationale, lowConfidence, model, generatedAt }. Manager can override.
  aiPbc: jsonb("ai_pbc"),
  // When it must be completed by; drives reminder + overdue escalation (once).
  dueOn: date("due_on"),
  reminderSentAt: timestamp("reminder_sent_at"),
  overdueEscalatedAt: timestamp("overdue_escalated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// 360 review cycle — one per monthly 1-2-1 period (join cycle <-> 1-2-1 on
// barberId + period, e.g. "2026-07"). The barber nominates 5 reviewers; each
// nominee is tracked to completion in three_sixty_nominees, and their scored
// feedback lands in three_sixty_responses. The 360 gates the 1-2-1: once enough
// responses are in, the 1-2-1 becomes ready and the AI PBC analysis runs.
export const threeSixtyCycles = pgTable("three_sixty_cycles", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull(),
  // Period label, e.g. "2026-H1".
  period: text("period").notNull(),
  openedOn: date("opened_on").notNull().defaultNow(),
  dueOn: date("due_on").notNull(),
  status: text("status").notNull().default("Open"), // Open | Complete
  inviteSentAt: timestamp("invite_sent_at"),
  completedAt: timestamp("completed_at"),
  // Google Calendar sync: an all-day milestone event on the shared calendar
  // marking the 360 due date, for leadership visibility.
  googleEventId: text("google_event_id"),
  calendarSyncedAt: timestamp("calendar_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const threeSixtyNominees = pgTable("three_sixty_nominees", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("Invited"), // Invited | Completed
  // Tokenised link the reviewer uses to submit feedback at /360/[token].
  token: text("token"),
  invitedAt: timestamp("invited_at"),
  remindedAt: timestamp("reminded_at"),
  respondedAt: timestamp("responded_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Scored 360 feedback from a single reviewer. Feeds the AI PBC analysis.
export const threeSixtyResponses = pgTable("three_sixty_responses", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull(),
  templateVersion: integer("template_version"),
  performance: integer("performance"), // 1-5
  behaviours: integer("behaviours"), // 1-5
  contribution: integer("contribution"), // 1-5
  relationship: text("relationship"), // how the reviewer works with the barber
  strengths: text("strengths"),
  improvements: text("improvements"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
})

// --- Strategic roadmap -----------------------------------------------------
// The 5x5 plan made explicit: time-phased milestones, the editable financial
// assumptions that flow from it (academy economics, tax, dividend policy),
// and the leadership salary schedule. lib/roadmap.ts reads these to build the
// projection that the dashboard and other surfaces reference.

// Editable key/value assumptions driving the projection. `isPlaceholder`
// flags figures (e.g. dividend %) that are indicative until finalised.
export const planAssumptions = pgTable("plan_assumptions", {
  key: text("key").primaryKey(),
  value: numeric("value").notNull(),
  label: text("label").notNull(),
  unit: text("unit").notNull().default("number"), // number | gbp | pct | year | months
  description: text("description"),
  isPlaceholder: boolean("is_placeholder").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// Board & director salary schedule. Performance-gated, commencing 2027.
export const leadershipSalaries = pgTable("leadership_salaries", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  holder: text("holder"),
  annualSalary: numeric("annual_salary").notNull().default("0"),
  shareClass: text("share_class"), // A | B | C | D
  startDate: date("start_date").notNull().default("2027-01-01"),
  performanceGated: boolean("performance_gated").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Editable per-opening headcount for the planned opening pipeline. The base
// OPENING_SCHEDULE (lib/plan.ts) defaults every site to 1 manager / 4 barbers /
// 1 apprentice, but real headcount depends on the size of the unit rented, so
// these rows override the defaults per opening (keyed by location+year+month).
export const openingRoleOverrides = pgTable(
  "opening_role_overrides",
  {
    id: serial("id").primaryKey(),
    location: text("location").notNull(),
    targetYear: integer("target_year").notNull(),
    targetMonth: integer("target_month").notNull(),
    managerCount: integer("manager_count").notNull().default(1),
    barberCount: integer("barber_count").notNull().default(4),
    apprenticeCount: integer("apprentice_count").notNull().default(1),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    key: unique("opening_role_overrides_key").on(t.location, t.targetYear, t.targetMonth),
  }),
)

// Time-phased milestones: shop openings, governance and finance events.
export const roadmapMilestones = pgTable("roadmap_milestones", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  detail: text("detail"),
  category: text("category").notNull().default("Expansion"), // Expansion | Governance | Finance | Milestone
  targetYear: integer("target_year").notNull(),
  targetMonth: integer("target_month"),
  status: text("status").notNull().default("Planned"), // Planned | In progress | Done | At risk
  brand: text("brand"), // Mid | Youth | Elite
  location: text("location"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Jobs board: vacancies advertised to staff and (optionally) externally.
// Postings can be created manually by dashboard users or auto-suggested from
// the HR & growth requirements (role gaps + opening pipeline) then confirmed.
export const jobPostings = pgTable("job_postings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  siteId: integer("site_id"), // optional link to an existing site
  location: text("location"),
  brand: text("brand"), // Mid | Youth | Elite
  role: text("role"), // Manager | Barber | Apprentice | etc.
  description: text("description"),
  // Optional manually-edited advert copy. When null/empty the advert is
  // auto-generated from the posting fields; once edited it overrides that.
  advertText: text("advert_text"),
  employmentType: text("employment_type").notNull().default("Full-time"),
  status: text("status").notNull().default("open"), // open | closed | filled
  finderBonus: numeric("finder_bonus").notNull().default("0"),
  source: text("source").notNull().default("manual"), // manual | gap | pipeline
  sourceKey: text("source_key"), // dedupe key for auto-suggested postings
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
})

// Referrals against a posting, with finder bonus tracking.
export const jobReferrals = pgTable("job_referrals", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  candidateName: text("candidate_name").notNull(),
  candidateContact: text("candidate_contact"),
  note: text("note"),
  finderUserId: text("finder_user_id"),
  finderName: text("finder_name"),
  status: text("status").notNull().default("submitted"), // submitted | interviewing | hired | rejected
  bonusStatus: text("bonus_status").notNull().default("pending"), // pending | approved | paid | void
  bonusAmount: numeric("bonus_amount"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// --- L&D: catalogue, plans, PBC --------------------------------------------

// Manually-populated course/qualification catalogue.
export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  provider: text("provider"),
  category: text("category"),
  delivery: text("delivery"),
  durationNote: text("duration_note"),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Which courses are required/recommended for a canonical ladder role
// (the "prerequisites for a job").
export const courseRoleReqs = pgTable(
  "course_role_reqs",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull(),
    role: text("role").notNull(),
    requirement: text("requirement").notNull().default("required"), // required | recommended
  },
  (t) => ({
    key: unique("course_role_reqs_key").on(t.courseId, t.role),
  }),
)

// Free-text gates required to be considered for a role.
export const roleGates = pgTable("role_gates", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  requirement: text("requirement").notNull(),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// One development plan per barber.
export const learningPlans = pgTable("learning_plans", {
  id: serial("id").primaryKey(),
  barberId: integer("barber_id").notNull().unique(),
  targetRole: text("target_role"),
  aspiration: text("aspiration"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const learningPlanItems = pgTable("learning_plan_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  courseId: integer("course_id"),
  title: text("title"),
  status: text("status").notNull().default("planned"), // planned | in_progress | complete
  targetDate: date("target_date"),
  completedOn: date("completed_on"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Monthly PBC rating (Performance / Behaviours / Contribution), 1 best - 5 lowest.
// One row per barber per period. Manager scores; barber self-scores live on the
// linked one_to_ones.self_prep for the two-stage flow.
export const pbcRatings = pgTable(
  "pbc_ratings",
  {
    id: serial("id").primaryKey(),
    barberId: integer("barber_id").notNull(),
    period: text("period").notNull(), // YYYY-MM
    performance: integer("performance"),
    behaviours: integer("behaviours"),
    contribution: integer("contribution"),
    overall: integer("overall"),
    ratedBy: text("rated_by"),
    ratedByName: text("rated_by_name"),
    comment: text("comment"),
    oneToOneId: integer("one_to_one_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    key: unique("pbc_ratings_barber_period").on(t.barberId, t.period),
  }),
)
