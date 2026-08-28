import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Vercel Image Optimization returns 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED
    // for AVIF/WebP on this plan, which breaks every <Image> in production.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'http2.mlstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
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
