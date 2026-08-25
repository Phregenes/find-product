import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { writeHeartbeat } from '@/lib/ops'

const SERVICE = 'ml_queue_rotation'

/** How long a failed/blocked ML search stays at the back of the queue. */
const PENALTY_MS = 6 * 60 * 60 * 1000

type PenaltyMap = Record<string, string>

async function loadPenalties(): Promise<PenaltyMap> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ops_heartbeats')
      .select('metadata')
      .eq('service', SERVICE)
      .maybeSingle()
    if (error || !data?.metadata || typeof data.metadata !== 'object') return {}
    const raw = (data.metadata as { penalized?: PenaltyMap }).penalized
    if (!raw || typeof raw !== 'object') return {}
    return { ...raw }
  } catch {
    return {}
  }
}

async function savePenalties(penalized: PenaltyMap, message: string): Promise<void> {
  await writeHeartbeat(SERVICE, 'ok', message, { penalized }).catch(() => {})
}

function pruneExpired(penalized: PenaltyMap, now = Date.now()): PenaltyMap {
  const next: PenaltyMap = {}
  for (const [id, iso] of Object.entries(penalized)) {
    const at = Date.parse(iso)
    if (!Number.isFinite(at)) continue
    if (now - at < PENALTY_MS) next[id] = iso
  }
  return next
}

/** Load active ML queue penalties (failed/blocked searches pushed to the back). */
export async function getMlQueuePenalties(): Promise<Map<string, number>> {
  const pruned = pruneExpired(await loadPenalties())
  const map = new Map<string, number>()
  for (const [id, iso] of Object.entries(pruned)) {
    map.set(id, Date.parse(iso))
  }
  return map
}

/** After ML blocks or fails on a search — rotate it behind others on the next cycles. */
export async function penalizeMlSearch(searchId: string, query: string): Promise<void> {
  const penalized = pruneExpired(await loadPenalties())
  penalized[searchId] = new Date().toISOString()
  await savePenalties(
    penalized,
    `ML fila: "${query}" foi para o fim após falha/bloqueio`,
  )
  console.log(`[cron] ML rotação: "${query}" penalizado — próximo ciclo tenta outra busca primeiro`)
}

/** Clear penalty after a successful ML scrape. */
export async function clearMlSearchPenalty(searchId: string): Promise<void> {
  const penalized = pruneExpired(await loadPenalties())
  if (!(searchId in penalized)) return
  delete penalized[searchId]
  await savePenalties(penalized, 'ML fila: penalidade removida após scrape OK')
}

/**
 * Sort key for ML searches: penalized go last; then oldest last_scraped_at;
 * never-scraped without penalty stay ahead of successful ones (fair), but behind penalties.
 */
export function mlQueueSortScore(
  searchId: string,
  lastScrapedAt: string | null | undefined,
  penalties: Map<string, number>,
): number {
  const penaltyAt = penalties.get(searchId)
  if (penaltyAt != null) {
    // Large offset so any penalized search sorts after non-penalized.
    return 1e15 + penaltyAt
  }
  if (!lastScrapedAt) return 0
  const t = Date.parse(lastScrapedAt)
  return Number.isFinite(t) ? t : 0
}
