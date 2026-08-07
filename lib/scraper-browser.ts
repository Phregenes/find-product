import 'server-only'

import type { Browser, Page } from 'playwright-core'

function getProxy() {
  const useProxy =
    !!process.env.VERCEL ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.USE_PROXY === 'true'
  if (!useProxy) return undefined

  const server = process.env.PROXY_SERVER?.trim()
  if (!server) return undefined
  return {
    server,
    username: process.env.PROXY_USERNAME?.trim() || undefined,
    password: process.env.PROXY_PASSWORD?.trim() || undefined,
  }
}

/** True when Playwright is launched with a proxy (serverless or USE_PROXY). */
export function isScrapeProxyActive(): boolean {
  return !!getProxy()
}

/**
 * Lean mode blocks ML/OLX CDNs to save proxy GB.
 * On local IP it makes the page look broken/bot-like and often triggers ML verification.
 */
export function shouldUseLeanBandwidth(requested?: boolean): boolean {
  if (requested === false) return false
  if (requested === true) return isScrapeProxyActive() || !!process.env.VERCEL
  return false
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

/** tsx/esbuild keepNames injects __name into page.evaluate callbacks. */
export async function primePageEvaluate(page: Page): Promise<void> {
  await applyMacSafeFontFamilies(page).catch(() => {})
  await page.evaluate('globalThis.__name=function(t){return t}')
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
  const leanBandwidth = shouldUseLeanBandwidth(opts?.leanBandwidth)

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    },
  })

  // String script: tsx/esbuild injects __name into function init scripts and breaks them.
  await context.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', {
      get: () => Object.freeze(['pt-BR', 'pt', 'en-US', 'en']),
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    window.chrome = window.chrome || { runtime: {} };
    globalThis.__name = function (t) { return t; };

    // Avoid macOS "download font" dialogs when pages list Osaka/STHeiti/etc.
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{font-family:Helvetica,Arial,sans-serif!important}';
    const mount = () => {
      const root = document.documentElement;
      if (root && !document.getElementById('__fp-safe-fonts')) {
        style.id = '__fp-safe-fonts';
        root.appendChild(style);
      }
    };
    mount();
    document.addEventListener('DOMContentLoaded', mount);
  `)

  // Playwright defaults map CJK → Osaka/STHeiti/etc. → macOS "download font" modal storm.
  context.on('page', (page) => {
    void applyMacSafeFontFamilies(page).catch(() => {})
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        void applyMacSafeFontFamilies(page).catch(() => {})
      }
    })
  })

  await context.route('**/*', (route) => {
    const url = route.request().url()
    const type = route.request().resourceType()
    if (shouldBlockRequest(url, type, blockImages, leanBandwidth)) {
      return route.abort()
    }
    return route.continue()
  })

  return context
}

/**
 * Force Chromium generic families away from Apple downloadable fonts.
 * Playwright may still apply its defaults first — ensure-mac-scrape-fonts patches those.
 */
async function applyMacSafeFontFamilies(page: Page): Promise<void> {
  if (process.platform !== 'darwin') return
  if (page.isClosed()) return

  const latin = {
    standard: 'Helvetica',
    fixed: 'Menlo',
    serif: 'Times',
    sansSerif: 'Helvetica',
    cursive: 'Helvetica',
    fantasy: 'Helvetica',
  }
  // Preinstalled on macOS — covers CJK without STHeiti/Osaka download prompts.
  const cjk = {
    standard: 'Hiragino Sans GB',
    fixed: 'Menlo',
    serif: 'Hiragino Sans GB',
    sansSerif: 'Hiragino Sans GB',
    cursive: 'Hiragino Sans GB',
    fantasy: 'Hiragino Sans GB',
  }
  const jp = {
    standard: 'Hiragino Kaku Gothic ProN',
    fixed: 'Menlo',
    serif: 'Hiragino Mincho ProN',
    sansSerif: 'Hiragino Kaku Gothic ProN',
    cursive: 'Hiragino Kaku Gothic ProN',
    fantasy: 'Hiragino Kaku Gothic ProN',
  }
  const kr = {
    standard: 'Apple SD Gothic Neo',
    fixed: 'Menlo',
    serif: 'Apple SD Gothic Neo',
    sansSerif: 'Apple SD Gothic Neo',
    cursive: 'Apple SD Gothic Neo',
    fantasy: 'Apple SD Gothic Neo',
  }

  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Page.setFontFamilies', {
      fontFamilies: latin,
      forScripts: [
        { script: 'jpan', fontFamilies: jp },
        { script: 'hang', fontFamilies: kr },
        { script: 'hans', fontFamilies: cjk },
        { script: 'hant', fontFamilies: cjk },
      ],
    })
  } finally {
    await session.detach().catch(() => {})
  }
}
