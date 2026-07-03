import 'server-only'

import type { PlanConfig } from '@/lib/plans'
import { dailyMonitorCreationLimit } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'

/** Calendar date in America/Sao_Paulo (YYYY-MM-DD). */
export function getBrtDateString(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export async function countMonitorCreationsToday(
  userId: string,
  now = new Date(),
): Promise<number> {
  const admin = createAdminClient()
  const brtDay = getBrtDateString(now)
  const { count, error } = await admin
    .from('monitor_creation_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('brt_day', brtDay)
  if (error) throw error
  return count ?? 0
}

export async function getMonitorCreationUsage(
  userId: string,
  plan: PlanConfig,
  now = new Date(),
): Promise<{
  creationsToday: number
  dailyCreationLimit: number
  remainingToday: number
}> {
  const creationsToday = await countMonitorCreationsToday(userId, now)
  const dailyCreationLimit = dailyMonitorCreationLimit(plan)
  return {
    creationsToday,
    dailyCreationLimit,
    remainingToday: Math.max(0, dailyCreationLimit - creationsToday),
  }
}

export async function assertCanCreateMonitorToday(
  userId: string,
  plan: PlanConfig,
  now = new Date(),
): Promise<void> {
  const { creationsToday, dailyCreationLimit } = await getMonitorCreationUsage(userId, plan, now)
  if (creationsToday >= dailyCreationLimit) {
    throw new MonitorDailyCreationLimitError(plan, dailyCreationLimit)
  }
}

export class MonitorDailyCreationLimitError extends Error {
  readonly code = 'MONITOR_DAILY_CREATION_LIMIT' as const

  constructor(
    readonly plan: PlanConfig,
    readonly dailyLimit: number,
  ) {
    super(
      `Limite diário de criação atingido (${dailyLimit} por dia no plano ${plan.name}). Tente novamente amanhã ou faça upgrade.`,
    )
    this.name = 'MonitorDailyCreationLimitError'
  }
}

export async function recordMonitorCreation(
  userId: string,
  monitorId: string,
  now = new Date(),
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('monitor_creation_events').insert({
    user_id: userId,
    monitor_id: monitorId,
    brt_day: getBrtDateString(now),
  })
  if (error) throw error
}
