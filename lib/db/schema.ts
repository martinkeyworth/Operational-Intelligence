import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  numeric,
  date,
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
export const weeklyTakings = pgTable("weekly_takings", {
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
})

// Weekly functional-leader confirmation of each site's details.
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
  analysisRunAt: timestamp("analysis_run_at"),
  reportSentAt: timestamp("report_sent_at"),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// 360 review cycle (every 6 months). The barber nominates 5 reviewers; each
// nominee is tracked to completion in three_sixty_nominees.
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
  invitedAt: timestamp("invited_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
