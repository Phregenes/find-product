import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/planos', '/status', '/login', '/register'],
      disallow: ['/app', '/api/', '/auth/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
