/** Subscription plan definitions — safe to import from client components.
 *
 * Edit PLANS below to change pricing, monitor limits, and scrape frequency.
 * - checkIntervalMinutes → how often the CRON scrapes (server, tab closed)
 * - clientRefreshMinutes → min interval to re-read DB while the app is open
 * - activeHourStart/End → BRT window when scraping is allowed
 * - emailAlerts → cron sends email when new listings appear
 * - mlAccess / olxAccess / enjoeiAccess → which marketplaces the plan may monitor
 * - customFilters → title relevance, condition, exclude terms
 *
 * New signups get `free`. Paid tiers: garimpo, lojista, pro.
 * Per-user plan is stored in `profiles.plan` (Supabase).
 * Cron is triggered externally (e.g. cron-job.org); each monitor is scraped per checkIntervalMinutes below.
 */

import type { MarketplaceMode } from '@/lib/product'

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
  mlAccess: boolean
  olxAccess: boolean
  enjoeiAccess: boolean
  /** Title filters, condition, and exclude terms. */
  customFilters: boolean
  /** How often we advertise the cron (may differ from 24h ÷ interval). */
  cadenceLabel: string
}

export const DEFAULT_PLAN_ID: PlanId = 'free'

export const PAID_PLAN_IDS: PaidPlanId[] = ['garimpo', 'lojista', 'pro']

const THREE_DAYS_MINUTES = 4320

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Grátis',
    priceMonthly: 0,
    monitorLimit: 1,
    checkIntervalMinutes: THREE_DAYS_MINUTES,
    clientRefreshMinutes: 1440,
    activeHourStart: 0,
    activeHourEnd: 24,
    tagline: 'Experimente 1 monitor na OLX, a cada 3 dias.',
    emailAlerts: false,
    mlAccess: false,
    olxAccess: true,
    enjoeiAccess: false,
    customFilters: false,
    cadenceLabel: '1× a cada 3 dias',
  },
  garimpo: {
    id: 'garimpo',
    name: 'Garimpo',
    priceMonthly: 19,
    monitorLimit: 4,
    checkIntervalMinutes: 1440,
    clientRefreshMinutes: 60,
    activeHourStart: 0,
    activeHourEnd: 24,
    tagline: 'OLX e Enjoei todo dia, com alerta por e-mail.',
    emailAlerts: true,
    mlAccess: false,
    olxAccess: true,
    enjoeiAccess: true,
    customFilters: true,
    cadenceLabel: '1× ao dia',
  },
  lojista: {
    id: 'lojista',
    name: 'Lojista',
    priceMonthly: 79,
    monitorLimit: 8,
    checkIntervalMinutes: 240,
    clientRefreshMinutes: 30,
    activeHourStart: 8,
    activeHourEnd: 20,
    tagline: 'OLX e Enjoei — 8 monitores, 3× ao dia.',
    emailAlerts: true,
    mlAccess: false,
    olxAccess: true,
    enjoeiAccess: true,
    customFilters: true,
    cadenceLabel: '3× ao dia',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 149,
    monitorLimit: 15,
    checkIntervalMinutes: 60,
    clientRefreshMinutes: 15,
    activeHourStart: 0,
    activeHourEnd: 24,
    tagline: 'Mercado Livre + OLX + Enjoei, de hora em hora, 24h.',
    emailAlerts: true,
    mlAccess: true,
    olxAccess: true,
    enjoeiAccess: true,
    customFilters: true,
    cadenceLabel: 'a cada 1 hora',
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

export function planAllowsMarketplaceMode(
  plan: PlanConfig,
  mode: MarketplaceMode,
): boolean {
  switch (mode) {
    case 'ml':
      return plan.mlAccess
    case 'olx':
      return plan.olxAccess
    case 'enjoei':
      return plan.enjoeiAccess
    case 'both':
      return plan.mlAccess && plan.olxAccess && plan.enjoeiAccess
  }
}

export function defaultMarketplaceMode(plan: PlanConfig): MarketplaceMode {
  if (planAllowsMarketplaceMode(plan, 'both')) return 'both'
  if (plan.olxAccess) return 'olx'
  if (plan.enjoeiAccess) return 'enjoei'
  if (plan.mlAccess) return 'ml'
  return 'olx'
}

export function formatPlanMarketplaces(plan: PlanConfig): string {
  const names: string[] = []
  if (plan.mlAccess) names.push('Mercado Livre')
  if (plan.olxAccess) names.push('OLX')
  if (plan.enjoeiAccess) names.push('Enjoei')
  if (names.length === 0) return 'Nenhum marketplace'
  if (names.length === 3) return 'Mercado Livre + OLX + Enjoei'
  return names.join(' + ')
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

/** Human label for cron scrape cadence (checkIntervalMinutes only). */
export function formatCheckInterval(minutes: number): string {
  if (minutes >= THREE_DAYS_MINUTES) return '1× a cada 3 dias'
  if (minutes >= 1440) return '1× ao dia'
  if (minutes === 480) return '3× ao dia'
  if (minutes === 240) return '6× ao dia'
  if (minutes === 60) return 'a cada 1 hora'
  if (1440 % minutes === 0) {
    const times = 1440 / minutes
    if (times >= 2 && times <= 24) return `${times}× ao dia`
  }
  if (minutes >= 60) return `a cada ${Math.round(minutes / 60)}h`
  return `a cada ${minutes} min`
}

/** Cadence as the user sees it (respects the BRT active window). */
export function formatPlanFrequency(plan: PlanConfig): string {
  return plan.cadenceLabel
}

/** Max ML/OLX pages per cron run for this plan (proxy cost control). */
export function cronScrapeMaxPages(planId: PlanId): number {
  switch (planId) {
    case 'free':
      return 1
    case 'garimpo':
      return 1
    case 'lojista':
      return 2
    case 'pro':
      return 3
    default:
      return 1
  }
}

export function formatRefreshMinutes(minutes: number): string {
  if (minutes >= THREE_DAYS_MINUTES) return '1× a cada 3 dias'
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
