/** Scrape depth and serverless tuning — safe for server-only imports. */

export const MONITOR_SCRAPE_MAX_PAGES = 8
export const OLX_SCRAPE_MAX_PAGES = 8

/** Fewer pages on Vercel/Lambda to reduce memory and browser lifetime. */
export const SERVERLESS_MONITOR_SCRAPE_MAX_PAGES = 4
export const SERVERLESS_OLX_SCRAPE_MAX_PAGES = 4

export function isServerlessScrape(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

export function getMonitorScrapeMaxPages(): number {
  return isServerlessScrape()
    ? SERVERLESS_MONITOR_SCRAPE_MAX_PAGES
    : MONITOR_SCRAPE_MAX_PAGES
}

export function getOlxScrapeMaxPages(): number {
  return isServerlessScrape()
    ? SERVERLESS_OLX_SCRAPE_MAX_PAGES
    : OLX_SCRAPE_MAX_PAGES
}
