import { notFound } from "next/navigation"
import Link from "next/link"
import { requireTeamAdmin, getAllUsers } from "@/lib/access"
import { PageHeader } from "@/components/ui-bits"
import { getTeamMemberDetail } from "@/lib/team"
import { TeamMemberManager } from "@/components/team-member-manager"
import { isCalendarConfigured } from "@/lib/google-calendar"
import { ArrowLeft, Eye } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireTeamAdmin()
  const { id } = await params
  const barberId = Number(id)
  const detail = await getTeamMemberDetail(barberId)
  if (!detail) notFound()

  const users = await getAllUsers()

  return (
    <>
      <PageHeader
        meta="Admin · Team Area"
        title={detail.self.barber.name}
        subtitle={`${detail.self.barber.role} · ${detail.self.barber.siteName}`}
      />
      <div className="flex items-center justify-between gap-3 px-5 py-4 md:px-8">
        <Link
          href="/admin/team"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Team Area
        </Link>
        <Link
          href={`/team?barber=${barberId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
        >
          <Eye className="h-4 w-4" /> Preview their Team Area
        </Link>
      </div>
      <div className="px-5 pb-8 md:px-8">
        <TeamMemberManager
          detail={detail}
          users={users.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
          calendarEnabled={isCalendarConfigured()}
        />
      </div>
    </>
  )
}
