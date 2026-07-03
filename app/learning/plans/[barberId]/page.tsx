import { requireUser, getAccessUser, canRatePbc } from "@/lib/access"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/ui-bits"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { OneToOneWorkflow } from "@/components/learning/one-to-one-workflow"
import { PlanEditor, type PlanEditorData } from "@/components/learning/plan-editor"
import { PbcHistory } from "@/components/learning/pbc-history"
import {
  getBarberBasics,
  getPlanForBarber,
  getCurrentOneToOne,
  getPbcForBarber,
  roleOptions,
  listCourses,
  readSelfPrep,
  readManagerAnswers,
} from "@/lib/learning"
import { currentPeriod } from "@/lib/learning-types"

export const dynamic = "force-dynamic"

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ barberId: string }>
}) {
  const { barberId: barberIdParam } = await params
  const barberId = Number(barberIdParam)
  await requireUser()
  const user = await getAccessUser()
  if (!user) redirect("/sign-in")

  const basics = await getBarberBasics(barberId)
  if (!basics) redirect("/learning/plans")

  // Gate: L&D manager or this barber's assigned manager only.
  if (!canRatePbc(user, basics.managerUserId)) redirect("/no-access")

  const [plan, oto, pbc, courses] = await Promise.all([
    getPlanForBarber(barberId),
    getCurrentOneToOne(barberId),
    getPbcForBarber(barberId),
    listCourses(false),
  ])

  const otoForPeriod = oto && oto.period === currentPeriod() ? oto : null

  const planData: PlanEditorData = {
    barberId,
    targetRole: plan.targetRole,
    aspiration: plan.plan.aspiration,
    items: plan.items.map((i) => ({
      id: i.id,
      courseId: i.courseId,
      courseTitle: i.courseTitle,
      title: i.title,
      status: i.status,
      targetDate: i.targetDate,
      notes: i.notes,
    })),
    requiredCourses: plan.requiredCourses.map((r) => ({
      course: { id: r.course.id, title: r.course.title },
      met: r.met,
    })),
    recommendedCourses: plan.recommendedCourses.map((c) => ({ id: c.id, title: c.title })),
    gates: plan.gates.map((g) => ({ id: g.id, requirement: g.requirement })),
    targetRoleTitle: plan.targetRoleTitle,
    progressPct: plan.progressPct,
  }

  return (
    <AppShell user={user}>
      <PageHeader
        meta={`L&D · ${basics.siteName}`}
        title={basics.name}
        subtitle={`${basics.role} · Target: ${plan.targetRoleTitle}`}
      />
      <div className="px-5 py-6 md:px-8">
        <Tabs defaultValue="oneToOne">
          <TabsList>
            <TabsTrigger value="oneToOne">Monthly 1-2-1</TabsTrigger>
            <TabsTrigger value="plan">Development plan</TabsTrigger>
            <TabsTrigger value="pbc">PBC history</TabsTrigger>
          </TabsList>
          <TabsContent value="oneToOne" className="pt-4">
            <OneToOneWorkflow
              barberId={barberId}
              barberName={basics.name}
              oneToOneId={otoForPeriod?.id ?? null}
              status={otoForPeriod ? otoForPeriod.status : "None"}
              period={currentPeriod()}
              selfPrep={readSelfPrep(otoForPeriod)}
              managerAnswersInit={readManagerAnswers(otoForPeriod).answers ?? {}}
              summaryInit={otoForPeriod?.summary ?? null}
              actionsInit={otoForPeriod?.actions ?? null}
            />
          </TabsContent>
          <TabsContent value="plan" className="pt-4">
            <PlanEditor data={planData} roles={roleOptions()} courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
          </TabsContent>
          <TabsContent value="pbc" className="pt-4">
            <PbcHistory
              history={pbc.history.map((h) => ({
                period: h.period,
                performance: h.performance,
                behaviours: h.behaviours,
                contribution: h.contribution,
                overall: h.overall,
                ratedByName: h.ratedByName,
                comment: h.comment,
              }))}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
