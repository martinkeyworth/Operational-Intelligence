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
} & Capabilities

export const COMPANY_DOMAIN = "lessthanzerobarbers.com"

export function isCompanyEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${COMPANY_DOMAIN}`)
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
