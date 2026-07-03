/**
 * Cron worker — roda runMonitorCron direto, sem Next.js e sem IPRoyal.
 *
 * Uso:
 *   npm run cron:worker          # uma vez
 *   npm run cron:worker:loop     # a cada 1h
 *
 * Requer .env.local com Supabase + (opcional) PREFER_LOCAL_SCRAPER na Vercel.
 * Não precisa de npm run dev.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const root = join(__dirname, '..')

function loadEnvFile(relativePath: string) {
  const path = join(root, relativePath)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

// Garante runtime local (sem proxy IPRoyal)
delete process.env.VERCEL
delete process.env.VERCEL_ENV
delete process.env.AWS_LAMBDA_FUNCTION_NAME

const loop = process.argv.includes('--loop')
const intervalMs = parseInt(process.env.LOCAL_CRON_INTERVAL_MS ?? '3600000', 10)

async function runOnce(): Promise<void> {
  const started = new Date().toISOString()
  console.log(`[cron:worker] ${started} — iniciando scrape (IP local, sem proxy)`)

  const { runMonitorCron } = await import('@/lib/monitor-cron')
  const result = await runMonitorCron()

  console.log(`[cron:worker] concluído`)
  console.log(JSON.stringify(result, null, 2))

  if (result.delegatedToLocal) {
    console.warn('[cron:worker] aviso: resposta inesperada delegatedToLocal no worker local')
  }
}

async function main(): Promise<void> {
  if (loop) {
    console.log(`[cron:worker] loop — a cada ${Math.round(intervalMs / 60_000)} min`)
    await runOnce()
    setInterval(() => {
      runOnce().catch((err) => console.error('[cron:worker]', err))
    }, intervalMs)
    return
  }

  await runOnce()
}

main().catch((err) => {
  console.error('[cron:worker]', err)
  process.exit(1)
})
