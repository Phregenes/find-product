/** Subscription plan definitions — safe to import from client components.
 *
 * Edit PLANS below to change pricing, monitor limits, and scrape frequency.
 * - checkIntervalMinutes → how often the CRON scrapes (server, tab closed)
 * - clientRefreshMinutes → min interval when user has the app open
 * - activeHourStart/End → BRT window when scraping is allowed
 *
 * New signups get `free`. Paid tiers: garimpo, lojista, pro.
 * Per-user plan is stored in `profiles.plan` (Supabase).
 * Vercel Hobby cron runs once daily (11:00 UTC = 8h BRT); Pro can use every-5-min schedule.
 */

export type PlanId = 'free' | 'garimpo' | 'lojista' | 'pro'

export type PaidPlanId = Exclude<PlanId, 'free'>

export interface PlanConfig {
  id: PlanId
  name: string
  priceMonthly: number
  monitorLimit: number
  /** Minimum minutes between server scrapes (cron) for this plan. */
  checkIntervalMinutes: number
  /** Minimum minutes between manual refreshes while the tab is open. */
  clientRefreshMinutes: number
  /** Active window in BRT (America/Sao_Paulo). End 24 = until midnight. */
  activeHourStart: number
  activeHourEnd: number
  /** Short marketing blurb for pricing page. */
  tagline: string
}

export const DEFAULT_PLAN_ID: PlanId = 'free'

export const PAID_PLAN_IDS: PaidPlanId[] = ['garimpo', 'lojista', 'pro']

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Grátis',
    priceMonthly: 0,
    monitorLimit: 1,
    checkIntervalMinutes: 1440,
    clientRefreshMinutes: 60,
    activeHourStart: 8,
    activeHourEnd: 20,
    tagline: 'Experimente com 1 monitor antes de assinar.',
  },
  garimpo: {
    id: 'garimpo',
    name: 'Garimpo',
    priceMonthly: 49,
    monitorLimit: 3,
    checkIntervalMinutes: 480,
    clientRefreshMinutes: 30,
    activeHourStart: 8,
    activeHourEnd: 20,
    tagline: 'Para quem garimpa oportunidades no dia a dia.',
  },
  lojista: {
    id: 'lojista',
    name: 'Lojista',
    priceMonthly: 129,
    monitorLimit: 8,
    checkIntervalMinutes: 30,
    clientRefreshMinutes: 10,
    activeHourStart: 8,
    activeHourEnd: 20,
    tagline: 'Mais monitores e atualizações frequentes.',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 249,
    monitorLimit: 15,
    checkIntervalMinutes: 10,
    clientRefreshMinutes: 5,
    activeHourStart: 8,
    activeHourEnd: 22,
    tagline: 'Máxima cobertura para operação profissional.',
  },
}

export const PLAN_LIST: PlanConfig[] = Object.values(PLANS)

export function getPlanConfig(planId: string | null | undefined): PlanConfig {
  if (planId && planId in PLANS) return PLANS[planId as PlanId]
  return PLANS[DEFAULT_PLAN_ID]
}

export function isPaidPlan(planId: PlanId): planId is PaidPlanId {
  return planId !== 'free'
}

export function formatPlanPrice(plan: PlanConfig): string {
  if (plan.priceMonthly === 0) return 'Grátis'
  return `R$ ${plan.priceMonthly}/mês`
}

export function formatRefreshMinutes(minutes: number): string {
  if (minutes >= 1440) return '1× ao dia'
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`
  return `${minutes} min`
}

/** Current hour in America/Sao_Paulo (0–23). */
export function getBrtHour(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(date),
  )
}

export function isWithinActiveHours(plan: PlanConfig, date = new Date()): boolean {
  const hour = getBrtHour(date)
  if (plan.activeHourEnd >= 24) return hour >= plan.activeHourStart
  return hour >= plan.activeHourStart && hour < plan.activeHourEnd
}

/** For a shared search, scrape at the fastest interval any subscriber needs. */
export function effectiveCheckIntervalMinutes(plans: PlanConfig[]): number {
  if (plans.length === 0) return Infinity
  return Math.min(...plans.map((p) => p.checkIntervalMinutes))
}

export function shouldScrapeNow(
  lastScrapedAt: string | null,
  subscriberPlans: PlanConfig[],
  now = new Date(),
): boolean {
  if (subscriberPlans.length === 0) return false
  if (!subscriberPlans.some((p) => isWithinActiveHours(p, now))) return false
  const intervalMin = effectiveCheckIntervalMinutes(subscriberPlans)
  if (!lastScrapedAt) return true
  const elapsedMin = (now.getTime() - new Date(lastScrapedAt).getTime()) / 60_000
  return elapsedMin >= intervalMin
}
