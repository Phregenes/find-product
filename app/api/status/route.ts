import { runStatusChecks } from '@/lib/ops'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const report = await runStatusChecks()
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
