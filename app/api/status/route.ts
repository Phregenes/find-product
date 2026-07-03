import { NextRequest } from 'next/server'
import { canViewOpsDetails } from '@/lib/ops-admin'
import { runStatusChecks } from '@/lib/ops'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const includeOpsDetail = await canViewOpsDetails(request)
    const report = await runStatusChecks({ includeOpsDetail })
    return Response.json(report)
  } catch (err) {
    return Response.json(
      {
        status: 'error',
        checkedAt: new Date().toISOString(),
        services: [],
        error: (err as Error).message,
      },
      { status: 500 },
    )
  }
}
