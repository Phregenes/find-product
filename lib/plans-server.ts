import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type PlanConfig,
  type PlanId,
  DEFAULT_PLAN_ID,
  getPlanConfig,
} from '@/lib/plans'

export async function getUserIdFromSession(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return (data?.claims?.sub as string | undefined) ?? null
}

export async function getUserPlan(userId: string): Promise<PlanConfig> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return getPlanConfig(data?.plan as PlanId | undefined)
}

export async function getSessionPlan(): Promise<{ userId: string; plan: PlanConfig } | null> {
  const userId = await getUserIdFromSession()
  if (!userId) return null
  const plan = await getUserPlan(userId)
  return { userId, plan }
}

export async function countUserMonitors(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('monitors')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw error
  return count ?? 0
}
