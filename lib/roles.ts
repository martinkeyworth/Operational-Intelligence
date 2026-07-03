// Roles & Responsibilities library for Less Than Zero. Captures the leadership
// remits and the operational chain described in the team job descriptions and
// the 2025–2030 business plan, so the org structure lives as queryable data
// rather than as scattered PDFs. Drives the Governance → Roles tab and gives a
// single source of truth for who is accountable for what.
//
// Status:
//  - "active"      — JD supplied and loaded.
//  - "drafted"     — summarised from the business plan / brief, to confirm.
//  - "outstanding" — role exists in the reporting chain but no JD supplied yet.

export type RoleStatus = "active" | "drafted" | "outstanding"
export type RoleTier = "Board" | "Leadership" | "Management" | "Frontline"

export type RoleDef = {
  key: string
  title: string
  tier: RoleTier
  status: RoleStatus
  // Person currently in the seat, by email where we have one (matches users).
  holderEmail?: string
  holderName?: string
  reportsTo?: string
  purpose: string
  // Function areas (canonical keys) this role is accountable for.
  ownsAreas: string[]
  responsibilities: string[]
  // Headline measures this role is held to.
  kpis?: string[]
  // Keywords used to route actions to this role when the function area alone
  // is ambiguous (e.g. "apprentice" → Academy/Training).
  routingKeywords?: string[]
}

export const ROLES: RoleDef[] = [
  {
    key: "ceo",
    title: "CEO / Founder",
    tier: "Board",
    status: "drafted",
    purpose:
      "Owns the strategic vision and majority control of the group. Sets the 2025–2030 direction, approves commercial targets, senior salaries and CSR commitments, and holds the leadership team accountable for delivery.",
    ownsAreas: ["Strategy"],
    responsibilities: [
      "Set and protect the long-term vision and the £5m revenue ambition.",
      "Retain majority (A-share) control and final say on equity and structure.",
      "Approve annual commercial targets, budgets and senior salary changes.",
      "Sign off CSR, sustainability and brand-defining commitments.",
      "Hold the COO and director team accountable through the cadence.",
    ],
    kpis: ["Group revenue vs £5m plan", "Group profitability", "Estate growth (5x5)"],
    routingKeywords: ["vision", "equity", "shareholder", "board", "founder"],
  },
  {
    key: "coo",
    title: "Chief Operating Officer",
    tier: "Leadership",
    status: "active",
    holderEmail: "cosmin@lessthanzerobarbers.com",
    holderName: "Cosmin",
    reportsTo: "ceo",
    purpose:
      "Runs the business day to day. Accountable for operations, P&L and profitability, compliance and risk, property and expansion within the growth plan, and for driving the team to deliver while interlocking actions as a single programme plan.",
    ownsAreas: ["Strategy", "RTB", "Finance", "Compliance", "Stock"],
    responsibilities: [
      "Own group operations, P&L and the 40% per-shop profitability target.",
      "Find and secure new sites within the 10-mile expansion radius.",
      "Govern compliance, H&S, employment law, GDPR, licensing and risk.",
      "Lead and performance-manage shop managers to hit targets.",
      "Drive delivery and ensure actions interlock as a programme plan.",
      "Own stock, supplier and inventory control across the estate.",
    ],
    kpis: ["Per-shop profitability (40%)", "Sites opened vs plan", "Compliance breaches", "Programme actions on track"],
    routingKeywords: [
      "governance", "compliance", "risk", "h&s", "health and safety", "gdpr",
      "licen", "property", "site", "lease", "expansion", "p&l", "profit",
      "finance", "budget", "cash", "stock", "inventory", "supplier", "interlock", "programme",
    ],
  },
  {
    key: "hr-director",
    title: "HR & Talent Director",
    tier: "Leadership",
    status: "active",
    holderEmail: "luke@lessthanzerobarbers.com",
    holderName: "Luke",
    reportsTo: "coo",
    purpose:
      "Owns people and talent. Builds the staffing pipeline and decides who is placed into each new shop in line with Mario's expansion plan, and runs recruitment, retention, onboarding and people compliance across the group.",
    ownsAreas: ["HR"],
    responsibilities: [
      "Plan initial staffing and who is placed into each new shop.",
      "Run recruitment, advertising and the hiring pipeline.",
      "Own onboarding, retention and people compliance.",
      "Manage performance issues and exits fairly and lawfully.",
      "Partner with Ravi on apprenticeship and L&D programmes.",
    ],
    kpis: ["Time to fill roles", "Staff retention rate", "New-shop staffing readiness"],
    routingKeywords: [
      "staff", "staffing", "recruit", "hir", "onboard", "retention", "people",
      "placement", "rota", "contract", "disciplinary", "grievance", "headcount",
    ],
  },
  {
    key: "creative-director",
    title: "Creative Director & Lead Trainer",
    tier: "Leadership",
    status: "active",
    holderEmail: "ravi@lessthanzerobarbers.com",
    holderName: "Ravi",
    reportsTo: "coo",
    purpose:
      "Owns learning, development and craft standards. Runs the academy, CPD, Google Classroom, private training and apprentice progress, and grows staff into new roles so people are ready for the expanding estate.",
    ownsAreas: ["Training"],
    responsibilities: [
      "Run the academy, NVQ and apprentice progression.",
      "Own CPD, Google Classroom and private training delivery.",
      "Set technical skill and creative-training standards for barbers.",
      "Mentor staff and build pathways into new and senior roles.",
      "Interlock training output with Luke's staffing and Mario's growth.",
    ],
    kpis: ["Apprentices on track", "Academy throughput vs capacity", "Staff promoted into new roles"],
    routingKeywords: [
      "train", "academy", "nvq", "apprentic", "cpd", "classroom", "mentor",
      "skill", "learning", "development", "assessor", "progression", "upskill",
    ],
  },
  {
    key: "brand-director",
    title: "Executive Brand Director",
    tier: "Leadership",
    status: "active",
    holderEmail: "mario@lessthanzerobarbers.com",
    holderName: "Mario",
    reportsTo: "coo",
    purpose:
      "Owns brand, demand and shop performance. Runs social media, brand strategy and campaigns, all shops and barber utilisation, RTB and target, and identifies where and when to grow by brand — including who is placed there initially.",
    ownsAreas: ["Marketing", "Capacity", "RTB", "Subletting", "CustomerExperience"],
    responsibilities: [
      "Own brand strategy, visual identity and campaign oversight.",
      "Run social media (daily Facebook, Instagram, Google) and reach.",
      "Drive barber utilisation, RTB and per-shop targets across all shops.",
      "Identify brand growth areas — where, when and who is placed there first.",
      "Own customer experience: reviews, loyalty, feedback and retention.",
    ],
    kpis: ["Chair utilisation %", "RTB per barber vs target", "Review score & volume", "Social reach"],
    routingKeywords: [
      "brand", "social", "marketing", "campaign", "instagram", "facebook",
      "google", "utilisation", "utilization", "rtb", "footfall", "review",
      "loyalty", "retention", "customer", "promotion", "menu", "pricing", "sublet",
    ],
  },
  {
    key: "gm",
    title: "General Manager",
    tier: "Management",
    status: "active",
    reportsTo: "coo",
    purpose:
      "Oversees multiple shops within a brand, ensuring shop managers hit performance, standards and profitability targets and that brand standards are applied consistently.",
    ownsAreas: ["Capacity", "RTB"],
    responsibilities: [
      "Oversee shop managers and ensure they meet performance targets.",
      "Apply brand standards and SOPs consistently across sites.",
      "Work with HR, Brand and Training directors on people and standards.",
      "Monitor stock, costs and customer experience across the patch.",
    ],
    kpis: ["Shops hitting target", "Brand standard audits", "Profitability per shop"],
    routingKeywords: ["general manager", "multi-site", "area manager", "standards audit"],
  },
  {
    key: "shop-manager",
    title: "Shop / Site Manager",
    tier: "Management",
    status: "active",
    reportsTo: "brand-director",
    purpose:
      "Runs a single site end to end — the role every barber, assistant and apprentice reports into. Reports to the Brand Manager and is accountable for daily operations, the on-site team, client experience, site performance and health & safety, holding site-level RTB, utilisation and standards.",
    ownsAreas: ["Capacity", "RTB", "CustomerExperience", "Stock", "Compliance"],
    responsibilities: [
      "Oversee day-to-day operations, workflow and company procedures.",
      "Manage bookings and walk-ins to maximise barber productivity.",
      "Keep the shop clean, organised and on-brand; handle opening/closing and cash-up.",
      "Monitor stock levels and order products and supplies as needed.",
      "Lead, motivate and performance-manage the barbering team.",
      "Support recruitment, onboarding and training of new barbers to brand standards.",
      "Run team meetings, check-ins and performance reviews.",
      "Ensure exceptional client experience; handle feedback, complaints and retention.",
      "Promote loyalty schemes and upsell products to drive retention.",
      "Work with the Brand Manager to hit revenue, productivity and satisfaction KPIs.",
      "Report daily, weekly and monthly performance to the Brand Manager.",
      "Ensure health & safety compliance and run regular risk assessments.",
    ],
    kpis: [
      "Shop revenue and profitability",
      "Client satisfaction and retention",
      "Barber productivity and appointment efficiency",
      "Stock management and product sales",
      "Staff retention and performance",
    ],
    routingKeywords: ["shop manager", "site manager", "store manager", "opening", "closing", "cash up", "walk-in", "booking"],
  },
  {
    key: "academy-trainer",
    title: "Academy Trainer / NVQ Assessor",
    tier: "Management",
    status: "active",
    holderEmail: "ravi@lessthanzerobarbers.com",
    holderName: "Ravi",
    reportsTo: "creative-director",
    purpose:
      "Delivers training and assesses apprentices through their NVQ — the apprentices' training-side reporting line. Held directly by Ravi as the group's trainer, core to the academy remit.",
    ownsAreas: ["Training"],
    responsibilities: [
      "Deliver academy and in-shop training sessions.",
      "Assess apprentice progress against NVQ milestones.",
      "Feed apprentice readiness back to shop managers and the academy.",
    ],
    kpis: ["Apprentice pass rate", "Milestones on track"],
    routingKeywords: ["assessor", "nvq", "academy trainer"],
  },
  {
    key: "assistant-manager",
    title: "Assistant Manager",
    tier: "Management",
    status: "active",
    reportsTo: "shop-manager",
    purpose:
      "Deputises for the shop manager, leads the floor in their absence and takes on management responsibilities while maintaining personal column performance.",
    ownsAreas: ["Capacity"],
    responsibilities: [
      "Deputise for the manager and lead the floor when needed.",
      "Support rota, stock and daily operational tasks.",
      "Step up into people and standards management for the site.",
    ],
    kpis: ["Personal column revenue", "Floor standards"],
    routingKeywords: ["assistant manager", "deputy"],
  },
  {
    key: "senior-barber",
    title: "Senior Barber",
    tier: "Frontline",
    status: "active",
    reportsTo: "shop-manager",
    purpose:
      "An experienced barber who leads by example on the floor, mentors junior barbers and upholds craft and service standards while maintaining strong personal column performance.",
    ownsAreas: ["Capacity"],
    responsibilities: [
      "Deliver high-quality cuts and set the standard on the floor.",
      "Mentor junior barbers and apprentices and uphold service standards.",
      "Maximise personal column utilisation, retail and rebooking.",
    ],
    kpis: ["Personal column revenue", "Rebooking rate", "Mentoring impact"],
    routingKeywords: ["senior barber", "lead barber"],
  },
  {
    key: "barber",
    title: "Barber",
    tier: "Frontline",
    status: "active",
    reportsTo: "shop-manager",
    purpose:
      "Delivers excellent haircuts and customer experience, maximising chair utilisation, retail and rebooking.",
    ownsAreas: ["Capacity"],
    responsibilities: [
      "Deliver high-quality cuts and customer service.",
      "Maximise column utilisation, retail upsell and rebooking.",
      "Maintain hygiene, standards and the brand experience.",
    ],
    kpis: ["Column utilisation", "Retail per client", "Rebooking rate"],
    routingKeywords: ["barber", "stylist", "column"],
  },
  {
    key: "apprentice",
    title: "Apprentice Barber",
    tier: "Frontline",
    status: "active",
    reportsTo: "shop-manager",
    purpose:
      "Learns the craft on the job and through the academy, progressing through NVQ milestones toward becoming a full barber.",
    ownsAreas: ["Training"],
    responsibilities: [
      "Complete training milestones and academy coursework.",
      "Support the floor, hygiene and customer experience.",
      "Build skills toward qualifying as a barber.",
    ],
    kpis: ["Milestones completed", "Attendance", "Skill assessments"],
    routingKeywords: ["apprentice"],
  },
]

export function getRoles(): RoleDef[] {
  return ROLES
}

export function findRole(key: string): RoleDef | undefined {
  return ROLES.find((r) => r.key === key)
}

export const TIER_ORDER: RoleTier[] = ["Board", "Leadership", "Management", "Frontline"]
