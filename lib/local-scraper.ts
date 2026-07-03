import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { writeHeartbeat } from '@/lib/ops'

export const LOCAL_SCRAPER_SERVICE = 'local_scraper'

export function isVercelRuntime(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

/** When true on Vercel, skip Playwright if the desktop scraper ran recently. */
export function isPreferLocalScraper(): boolean {
  return process.env.PREFER_LOCAL_SCRAPER === 'true'
}

export function localScraperTtlMinutes(): number {
  const n = parseInt(process.env.LOCAL_SCRAPER_TTL_MINUTES ?? '70', 10)
  return Number.isFinite(n) && n > 0 ? n : 70
}

export async function writeLocalScraperHeartbeat(
  status: 'ok' | 'degraded' | 'error',
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await writeHeartbeat(LOCAL_SCRAPER_SERVICE, status, message, {
    ...metadata,
    runner: isVercelRuntime() ? 'vercel' : 'local',
    host: process.env.LOCAL_SCRAPER_NAME?.trim() || 'desktop',
  })
}

export async function getLocalScraperLastSeen(): Promise<{
  at: Date
  message: string | null
  status: string
} | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ops_heartbeats')
      .select('updated_at, status, message')
      .eq('service', LOCAL_SCRAPER_SERVICE)
      .maybeSingle()
    if (error || !data?.updated_at) return null
    return {
      at: new Date(data.updated_at as string),
      message: data.message as string | null,
      status: data.status as string,
    }
  } catch {
    return null
  }
}

export async function isLocalScraperActive(withinMinutes?: number): Promise<boolean> {
  const last = await getLocalScraperLastSeen()
  if (!last) return false
  const ttl = (withinMinutes ?? localScraperTtlMinutes()) * 60_000
  return Date.now() - last.at.getTime() < ttl
}

/** Vercel cron: skip scrape when desktop runner is handling it. */
export async function shouldDelegateToLocalScraper(): Promise<{
  delegate: boolean
  reason?: string
}> {
  if (!isVercelRuntime()) return { delegate: false }
  if (!isPreferLocalScraper()) return { delegate: false }
  const last = await getLocalScraperLastSeen()
  if (!last) return { delegate: false }
  const active = await isLocalScraperActive()
  if (!active) return { delegate: false }
  return {
    delegate: true,
    reason: `Scraper local ativo (${last.message ?? 'heartbeat recente'}) — cron na Vercel não usa proxy.`,
  }
}
