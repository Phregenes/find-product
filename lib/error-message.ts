/** Normalize unknown thrown values (e.g. Supabase errors) into a readable message. */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>
    if (typeof record.message === 'string' && record.message) return record.message
    if (typeof record.details === 'string' && record.details) return record.details
    if (typeof record.hint === 'string' && record.hint) return record.hint
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

export function isBrowserClosedError(err: unknown): boolean {
  const msg = toErrorMessage(err).toLowerCase()
  return msg.includes('target page, context or browser has been closed')
    || msg.includes('browser has been closed')
}

/** Supabase / network blips (504 Gateway Timeout, etc.). */
export function isTransientDbError(err: unknown): boolean {
  const msg = toErrorMessage(err).toLowerCase()
  return (
    msg.includes('gateway timeout')
    || msg.includes('502')
    || msg.includes('503')
    || msg.includes('504')
    || msg.includes('fetch failed')
    || msg.includes('econnreset')
    || msg.includes('etimedout')
    || msg.includes('socket hang up')
    || msg.includes('network request failed')
    || msg.includes('<html')
  )
}

export async function withTransientRetry<T>(
  run: () => Promise<T>,
  opts?: { attempts?: number; delayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 3
  const delayMs = opts?.delayMs ?? 2_000
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await run()
    } catch (err) {
      last = err
      if (!isTransientDbError(err) || i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw last
}

export function isMarketplaceBlockedError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code
    if (code === 'ML_BLOCKED' || code === 'OLX_BLOCKED' || code === 'ENJOEI_BLOCKED') return true
  }
  const msg = toErrorMessage(err).toLowerCase()
  return msg.includes('bloqueou o acesso automático')
}

/** User-facing scrape errors (cron / status). */
export function formatScrapeError(err: unknown): string {
  const msg = toErrorMessage(err)
  if (isBrowserClosedError(err)) {
    return 'O Chrome do scrape foi encerrado no servidor (memória ou tempo limite na Vercel). O próximo cron tenta de novo.'
  }
  if (isTransientDbError(err) || /gateway timeout/i.test(msg)) {
    return 'Falha temporária ao falar com o banco (Gateway Timeout). Tente de novo em alguns segundos.'
  }
  if (/timeout.*exceeded/i.test(msg) || msg.includes('Timeout')) {
    return 'Tempo esgotado ao carregar a página do marketplace.'
  }
  return msg.length > 280 ? `${msg.slice(0, 277)}…` : msg
}
