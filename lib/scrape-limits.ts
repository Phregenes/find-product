import 'server-only'

/** Scrape depth caps — keep proxy bandwidth low on serverless. */
export const MONITOR_SCRAPE_MAX_PAGES = 6
export const OLX_SCRAPE_MAX_PAGES = 6
export const ENJOEI_SCRAPE_MAX_PAGES = 6

export const SERVERLESS_MONITOR_SCRAPE_MAX_PAGES = 2
export const SERVERLESS_OLX_SCRAPE_MAX_PAGES = 2
export const SERVERLESS_ENJOEI_SCRAPE_MAX_PAGES = 2

export function isServerlessScrape(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

export function getMonitorScrapeMaxPages(override?: number): number {
  if (override != null) return override
  return isServerlessScrape()
    ? SERVERLESS_MONITOR_SCRAPE_MAX_PAGES
    : MONITOR_SCRAPE_MAX_PAGES
}

export function getOlxScrapeMaxPages(override?: number): number {
  if (override != null) return override
  return isServerlessScrape()
    ? SERVERLESS_OLX_SCRAPE_MAX_PAGES
    : OLX_SCRAPE_MAX_PAGES
}

export function getEnjoeiScrapeMaxPages(override?: number): number {
  if (override != null) return override
  return isServerlessScrape()
    ? SERVERLESS_ENJOEI_SCRAPE_MAX_PAGES
    : ENJOEI_SCRAPE_MAX_PAGES
}
