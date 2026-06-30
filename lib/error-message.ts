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
