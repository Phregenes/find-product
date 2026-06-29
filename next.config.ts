import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'http2.mlstatic.com',
      },
    ],
  },
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium', '@sparticuz/chromium-min'],
  outputFileTracingIncludes: {
    '/api/search': [
      './node_modules/playwright-core/**/*',
      './node_modules/@sparticuz/chromium/bin/**',
      './node_modules/@sparticuz/chromium/build/**',
    ],
    '/api/cron/scrape': [
      './node_modules/playwright-core/**/*',
      './node_modules/@sparticuz/chromium/bin/**',
      './node_modules/@sparticuz/chromium/build/**',
    ],
  },
}

export default nextConfig
