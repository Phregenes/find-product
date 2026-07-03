/** Subscription plan definitions — safe to import from client components.
 *
 * Edit PLANS below to change pricing, monitor limits, and scrape frequency.
 * - checkIntervalMinutes → how often the CRON scrapes (server, tab closed)
 * - clientRefreshMinutes → min interval to re-read DB while the app is open
 * - activeHourStart/End → BRT window when scraping is allowed
 * - emailAlerts → cron sends email when new listings appear (Lojista+)
 * - olxAccess → OLX and ML+OLX monitors (Lojista+)
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
  /** Whether this plan sends new-listing alerts by email (cron). */
  emailAlerts: boolean
  /** OLX and ML+OLX monitors (Lojista and Pro). */
  olxAccess: boolean
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
    clientRefreshMinutes: 1440,
    activeHourStart: 0,
    activeHourEnd: 24,
    tagline: 'Experimente com 1 monitor antes de assinar.',
    emailAlerts: false,
    olxAccess: false,
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
    emailAlerts: false,
    olxAccess: false,
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
    emailAlerts: true,
    olxAccess: true,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 249,
    monitorLimit: 15,
    checkIntervalMinutes: 10,
    clientRefreshMinutes: 5,
    activeHourStart: 0,
    activeHourEnd: 24,
    tagline: 'Máxima cobertura para operação profissional.',
    emailAlerts: true,
    olxAccess: true,
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

export function planSupportsOlx(planId: PlanId | string | null | undefined): boolean {
  return getPlanConfig(planId).olxAccess
}

/** Max new monitors per calendar day (BRT) — monitorLimit + 1 anti abuse. */
export function dailyMonitorCreationLimit(plan: PlanConfig): number {
  return plan.monitorLimit + 1
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
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(date),
  )
  // Some runtimes return 24 for midnight instead of 0.
  return hour === 24 ? 0 : hour
}

export function formatActiveHours(plan: PlanConfig): string {
  if (plan.activeHourStart === 0 && plan.activeHourEnd >= 24) return '24 horas'
  return `das ${plan.activeHourStart}h às ${plan.activeHourEnd}h`
}

export function isWithinActiveHours(plan: PlanConfig, date = new Date()): boolean {
  if (plan.activeHourStart === 0 && plan.activeHourEnd >= 24) return true
  const hour = getBrtHour(date)
  if (plan.activeHourEnd >= 24) return hour >= plan.activeHourStart
  return hour >= plan.activeHourStart && hour < plan.activeHourEnd
}

/** True when this monitor may pull fresh data (shared cache or scrape). */
export function isSnapshotDue(
  snapshotAt: string | null,
  plan: PlanConfig,
  now = new Date(),
  force = false,
): boolean {
  if (force) return true
  if (!snapshotAt) return true
  const elapsedMin = (now.getTime() - new Date(snapshotAt).getTime()) / 60_000
  return elapsedMin >= plan.checkIntervalMinutes
}

/** Minutes until this monitor's snapshot can refresh. */
export function minutesUntilSnapshotDue(
  snapshotAt: string | null,
  plan: PlanConfig,
  now = new Date(),
): number {
  if (!snapshotAt) return 0
  const elapsedMin = (now.getTime() - new Date(snapshotAt).getTime()) / 60_000
  return Math.max(0, plan.checkIntervalMinutes - elapsedMin)
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
