/** Public site URL for metadata, OG tags and sitemap. */
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (url) return url.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export const SITE_NAME = 'FindProduct'

export const SITE_DESCRIPTION =
  'Monitore buscas no Mercado Livre e receba alertas de anúncios novos. Ideal para revendedores, lojistas e garimpeiros que não podem perder oportunidades.'

export const SITE_KEYWORDS = [
  'mercado livre',
  'monitoramento mercado livre',
  'alerta anúncios novos',
  'revenda mercado livre',
  'garimpo mercado livre',
  'findproduct',
]
