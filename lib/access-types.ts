// Client-safe access types and constants (no server-only imports).

export type Capabilities = {
  canViewDashboard: boolean
  isBarber: boolean
  isTrainingLead: boolean
  isHrLead: boolean
  isSocialMedia: boolean
}

export type AccessUser = {
  id: string
  name: string
  email: string
  isCompany: boolean
  isOwner: boolean
} & Capabilities

export const COMPANY_DOMAIN = "lessthanzerobarbers.com"

// Owners/Directors with access to the secure Split area (set barber/business %).
export const OWNER_EMAILS = [
  "martin@lessthanzerobarbers.com",
  "cosmin@lessthanzerobarbers.com",
]

// Cosmin chairs the weekly operational meeting (risk register owner view).
export const OPS_MEETING_CHAIR_EMAIL = "cosmin@lessthanzerobarbers.com"

export function isCompanyEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${COMPANY_DOMAIN}`)
}

export function isOwnerEmail(email: string): boolean {
  return OWNER_EMAILS.includes(email.toLowerCase())
}

export const CAPABILITY_LABELS: {
  key: keyof Capabilities
  label: string
  description: string
}[] = [
  {
    key: "canViewDashboard",
    label: "View Dashboard",
    description: "Access the group executive dashboard, sites, and action register.",
  },
  { key: "isBarber", label: "Barber", description: "Enter their own weekly takings." },
  {
    key: "isTrainingLead",
    label: "Training Lead",
    description: "Responsible for training KPIs and actions.",
  },
  {
    key: "isHrLead",
    label: "HR Lead",
    description: "Responsible for people/HR KPIs and actions.",
  },
  {
    key: "isSocialMedia",
    label: "Social Media",
    description: "Responsible for marketing/social KPIs and actions.",
  },
]
