import { getSessionPlan, countUserMonitors } from '@/lib/plans-server'
import { getMonitorCreationUsage } from '@/lib/monitor-creation-limit'
import { PLANS, dailyMonitorCreationLimit } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** Current user's plan + usage. Public catalog in `plans`. */
export async function GET() {
  const session = await getSessionPlan()
  if (!session) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const monitorCount = await countUserMonitors(session.userId)
  const creationUsage = await getMonitorCreationUsage(session.userId, session.plan)

  return Response.json({
    plan: session.plan,
    usage: {
      monitors: monitorCount,
      monitorLimit: session.plan.monitorLimit,
      creationsToday: creationUsage.creationsToday,
      dailyCreationLimit: creationUsage.dailyCreationLimit,
      remainingCreationsToday: creationUsage.remainingToday,
    },
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      monitorLimit: p.monitorLimit,
      dailyCreationLimit: dailyMonitorCreationLimit(p),
      checkIntervalMinutes: p.checkIntervalMinutes,
      clientRefreshMinutes: p.clientRefreshMinutes,
      activeHourStart: p.activeHourStart,
      activeHourEnd: p.activeHourEnd,
      tagline: p.tagline,
      emailAlerts: p.emailAlerts,
      mlAccess: p.mlAccess,
      olxAccess: p.olxAccess,
      enjoeiAccess: p.enjoeiAccess,
      customFilters: p.customFilters,
    })),
  })
}
