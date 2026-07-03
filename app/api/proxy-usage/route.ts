import { getProxyUsageSummary, isProxyEnabled } from '@/lib/proxy-usage'

export const dynamic = 'force-dynamic'

/** Proxy bandwidth usage + runway (IPRoyal). Same data as /status `proxy` field. */
export async function GET() {
  if (!isProxyEnabled()) {
    return Response.json({
      enabled: false,
      message: 'Proxy não configurado neste ambiente',
    })
  }

  try {
    const cronRunsPerDay = parseInt(process.env.PROXY_CRON_RUNS_PER_DAY ?? '12', 10)
    const summary = await getProxyUsageSummary(30, cronRunsPerDay)
    return Response.json({ enabled: true, ...summary })
  } catch (err) {
    return Response.json(
      { enabled: true, error: (err as Error).message },
      { status: 500 },
    )
  }
}
