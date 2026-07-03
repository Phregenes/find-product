import 'server-only'

import { createClient } from '@/lib/supabase/server'

const OPS_DETAIL_SERVICE_IDS = new Set(['cron', 'local_scraper'])

export function opsDetailServiceIds(): ReadonlySet<string> {
  return OPS_DETAIL_SERVICE_IDS
}

function adminEmails(): string[] {
  return (process.env.OPS_ADMIN_EMAILS ?? 'phregenes@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

function isLocalHostRequest(request?: Request): boolean {
  if (process.env.NODE_ENV === 'development') return true
  const host = request?.headers.get('host') ?? ''
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
}

/** Cron + scraper local visíveis só em localhost/dev ou e-mail admin (OPS_ADMIN_EMAILS). */
export async function canViewOpsDetails(request?: Request): Promise<boolean> {
  if (isLocalHostRequest(request)) return true

  const emails = adminEmails()
  if (emails.length === 0) return false

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const email = (data?.claims?.email as string | undefined)?.toLowerCase()
  return email != null && emails.includes(email)
}
