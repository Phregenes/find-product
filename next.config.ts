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
}

export default nextConfig
