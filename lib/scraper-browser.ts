import 'server-only'

import type { Browser } from 'playwright-core'

function getProxy() {
  const isServerless =
    !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  if (!isServerless) return undefined

  const server = process.env.PROXY_SERVER?.trim()
  if (!server) return undefined
  return {
    server,
    username: process.env.PROXY_USERNAME?.trim() || undefined,
    password: process.env.PROXY_PASSWORD?.trim() || undefined,
  }
}

export async function launchBrowser() {
  const proxy = getProxy()
  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ]

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default
    const executablePath = await chromium.executablePath()
    const { chromium: pw } = await import('playwright-core')
    const args = (chromium.args as string[]).filter((a) => !a.startsWith('--headless'))
    return pw.launch({ args: [...args, ...launchArgs], executablePath, headless: true, proxy })
  }

  const { chromium } = await import('playwright')
  return chromium.launch({ headless: true, args: launchArgs, proxy })
}

export async function createScrapeContext(
  browser: Browser,
  opts?: { blockImages?: boolean },
) {
  const blockImages = opts?.blockImages !== false

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  if (blockImages) {
    await context.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (type === 'image' || type === 'media' || type === 'font') {
        return route.abort()
      }
      return route.continue()
    })
  }

  await context.addCookies([
    {
      name: '_bm_skipml',
      value: 'true',
      domain: '.mercadolivre.com.br',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 86_400,
    },
  ])

  return context
}
