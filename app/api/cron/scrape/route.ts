import { NextRequest } from 'next/server'
import { runMonitorCron } from '@/lib/monitor-cron'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const result = await runMonitorCron()
  return Response.json(result)
}
