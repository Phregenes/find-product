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

/** Third-party hosts that burn proxy bandwidth without helping the scrape. */
const BLOCKED_HOST_SUFFIXES = [
  'doubleclick.net',
  'googlesyndication.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googleadservices.com',
  'facebook.net',
  'facebook.com',
  'taboola.com',
  'criteo.com',
  'criteo.net',
  'hotjar.com',
  'rubiconproject.com',
  'pubmatic.com',
  'adnxs.com',
  'quantserve.com',
  'adsafeprotected.com',
  'qualtrics.com',
  'amazon-adsystem.com',
  'outbrain.com',
  'smartadserver.com',
  'tiktok.com',
  'tiktokw.us',
  'datadoghq-browser-agent.com',
  'mouseflow.com',
  'spotify.com',
  'turn.com',
  'adform.net',
  'casalemedia.com',
  'openx.net',
  'media.net',
  '33across.com',
  'sharethrough.com',
  'rlcdn.com',
  'mathtag.com',
  'privacymanager.io',
  'seedtag.com',
  'flashtalking.com',
  'creativecdn.com',
  'temu.com',
]

/** ML asset / telemetry hosts — blocked in cron (lean) mode; list HTML is enough. */
const LEAN_BANDWIDTH_HOST_SUFFIXES = [
  'mlstatic.com',
  'matt.mercadolivre.com.br',
  'snoopy.mercadolibre.com',
  'mercadoclics.com',
  'api.mercadolibre.com',
  'events.mercadolibre.com',
  'o11y-proxy-otel-frontend.meli.com',
  'static.olx.com.br',
  'cdn.track.olx.com.br',
  'search-microfrontends.olx.com.br',
  'lurker.olx.com.br',
]

export interface ScrapeContextOptions {
  blockImages?: boolean
  /** Cron: block asset CDNs; parse image URLs from HTML attributes only. */
  leanBandwidth?: boolean
}

function isLeanBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return LEAN_BANDWIDTH_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return BLOCKED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )
}

function shouldBlockRequest(
  url: string,
  resourceType: string,
  blockImages: boolean,
  leanBandwidth: boolean,
): boolean {
  if (blockImages && (resourceType === 'image' || resourceType === 'media' || resourceType === 'font')) {
    return true
  }
  if (leanBandwidth && (resourceType === 'stylesheet' || resourceType === 'font' || resourceType === 'media')) {
    return true
  }
  try {
    const host = new URL(url).hostname
    if (isBlockedHost(host)) return true
    if (leanBandwidth && isLeanBlockedHost(host)) return true
    return false
  } catch {
    return false
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
  opts?: ScrapeContextOptions,
) {
  const blockImages = opts?.blockImages !== false
  const leanBandwidth = opts?.leanBandwidth === true

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

  await context.route('**/*', (route) => {
    const url = route.request().url()
    const type = route.request().resourceType()
    if (shouldBlockRequest(url, type, blockImages, leanBandwidth)) {
      return route.abort()
    }
    return route.continue()
  })

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
