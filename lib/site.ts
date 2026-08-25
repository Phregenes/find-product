/** Public site URL for metadata, OG tags and sitemap. */
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (url) return url.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export const SITE_NAME = 'FindProduct'

export const SITE_DESCRIPTION =
  'Monitore anúncios novos na OLX de graça. Enjoei no Garimpo, Mercado Livre no Pro. Alertas no app e por e-mail para quem revende usado.'

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
