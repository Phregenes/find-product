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

/** User-facing scrape errors (cron / status). */
export function formatScrapeError(err: unknown): string {
  const msg = toErrorMessage(err)
  if (isBrowserClosedError(err)) {
    return 'O Chrome do scrape foi encerrado no servidor (memória ou tempo limite na Vercel). O próximo cron tenta de novo.'
  }
  if (/timeout.*exceeded/i.test(msg) || msg.includes('Timeout')) {
    return 'Tempo esgotado ao carregar a página do marketplace.'
  }
  return msg.length > 280 ? `${msg.slice(0, 277)}…` : msg
}
