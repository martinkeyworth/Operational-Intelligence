// Client-safe job advert formatting. No server-only imports here so this can
// be pulled into client components (the jobs board) without leaking the
// database layer into the browser bundle.

export type JobAdvertInput = {
  title: string
  location: string | null
  brand: string | null
  role: string | null
  employmentType: string
  description: string | null
  finderBonus: number
}

/** Build social-ready advert copy for a posting. */
export function formatJobAdvert(job: JobAdvertInput): string {
  const lines: string[] = []
  const brand = job.brand ? `${job.brand} ` : ""
  lines.push(`We're hiring: ${job.title}`)
  lines.push("")
  if (job.location) lines.push(`📍 Location: ${job.location}`)
  if (job.brand) lines.push(`✂️ Brand: ${job.brand}`)
  if (job.role) lines.push(`👤 Role: ${job.role}`)
  lines.push(`🕒 ${job.employmentType}`)
  lines.push("")
  lines.push(
    job.description || `Join the ${brand}team and grow your career with us.`,
  )
  lines.push("")
  if (job.finderBonus > 0) {
    lines.push(
      `💷 Know someone perfect? Refer them and earn a £${job.finderBonus} finder's bonus when they're hired.`,
    )
    lines.push("")
  }
  lines.push("Apply or refer a friend through the team app today.")
  lines.push(
    "#hiring #barberjobs" +
      (job.location ? ` #${job.location.replace(/\s+/g, "")}` : ""),
  )
  return lines.join("\n")
}
