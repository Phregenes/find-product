/** Public site URL for metadata, OG tags and sitemap. */
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (url) return url.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export const SITE_NAME = 'FindProduct'

export const SITE_DESCRIPTION =
  'Monitore buscas no Mercado Livre, OLX e Enjoei, com filtros inteligentes e alertas de anúncios novos. Ideal para revendedores, lojistas e garimpeiros.'

export const SITE_KEYWORDS = [
  'mercado livre',
  'olx',
  'enjoei',
  'monitoramento mercado livre',
  'monitoramento olx',
  'monitoramento enjoei',
  'alerta anúncios novos',
  'revenda mercado livre',
  'garimpo mercado livre',
  'findproduct',
]
