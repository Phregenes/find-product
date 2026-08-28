import type { MarketplaceMode, Product } from '@/lib/product'
import {
  inferProductMarketplace,
  marketplaceBadgeEmailHtml,
  newProductsEmailHeadline,
  normalizeProductLink,
  parseMarketplaceMode,
  productMarketplaceLabel,
} from '@/lib/marketplace'

const MAX_PRODUCTS_IN_EMAIL = 10

export function buildNewProductsEmail({
  monitorQuery,
  marketplaceMode,
  products,
  appUrl,
}: {
  monitorQuery: string
  marketplaceMode?: MarketplaceMode
  products: Product[]
  appUrl: string
}): { subject: string; html: string; text: string } {
  const mode = parseMarketplaceMode(marketplaceMode)
  const count = products.length
  const shown = products.slice(0, MAX_PRODUCTS_IN_EMAIL)
  const extra = count - shown.length
  const headline = newProductsEmailHeadline(mode)

  const subject =
    count === 1
      ? `1 novidade em "${monitorQuery}"`
      : `${count} novidades em "${monitorQuery}"`

  const productRowsHtml = shown
    .map((p) => {
      const marketplace = inferProductMarketplace(p)
      const badge = marketplaceBadgeEmailHtml(marketplace)
      const link = normalizeProductLink(p.link)
      const locationLine = p.location
        ? `<div style="margin-top:2px;font-size:12px;color:#a1a1aa;">${escapeHtml(p.location)}</div>`
        : ''
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e4e4e7;">
          <div style="margin-bottom:6px;">${badge}</div>
          <a href="${escapeHtml(link)}" style="color:#18181b;text-decoration:none;font-weight:600;font-size:15px;line-height:1.4;">
            ${escapeHtml(p.title)}
          </a>
          <div style="margin-top:4px;font-size:14px;color:#71717a;">${escapeHtml(p.price)}</div>
          ${locationLine}
        </td>
      </tr>`
    })
    .join('')

  const extraHtml =
    extra > 0
      ? `<p style="margin:16px 0 0;font-size:13px;color:#71717a;">+ ${extra} outro${extra === 1 ? '' : 's'} no app.</p>`
      : ''

  const monitorMeta =
    mode === 'both'
      ? 'Mercado Livre, OLX e Enjoei'
      : mode === 'olx_enjoei'
        ? 'OLX e Enjoei'
        : mode === 'olx'
          ? 'OLX'
          : mode === 'enjoei'
            ? 'Enjoei'
            : 'Mercado Livre'

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#fafafa;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 8px;">
              <div style="display:inline-block;background:#facc15;color:#18181b;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;">FindProduct</div>
              <h1 style="margin:16px 0 8px;font-size:22px;color:#18181b;">${escapeHtml(headline)}</h1>
              <p style="margin:0;font-size:14px;color:#71717a;">Monitor: <strong style="color:#18181b;">${escapeHtml(monitorQuery)}</strong></p>
              <p style="margin:6px 0 0;font-size:12px;color:#a1a1aa;">Fontes: ${escapeHtml(monitorMeta)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">${productRowsHtml}</table>
              ${extraHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <a href="${escapeHtml(appUrl)}/app" style="display:inline-block;background:#facc15;color:#18181b;font-size:14px;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:12px;">
                Abrir no FindProduct
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa;">Você recebe este e-mail porque ativou alertas neste monitor no FindProduct.</p>
      </td>
    </tr>
  </table>
</body>
</html>`

  const lines = shown.map((p) => {
    const tag = productMarketplaceLabel(inferProductMarketplace(p))
    const loc = p.location ? ` (${p.location})` : ''
    return `• [${tag}] ${p.title} — ${p.price}${loc}\n  ${normalizeProductLink(p.link)}`
  })
  if (extra > 0) lines.push(`+ ${extra} outros no app`)
  const text = `${subject}\n\n${headline}\nFontes: ${monitorMeta}\n\n${lines.join('\n\n')}\n\nAbrir app: ${appUrl}/app`

  return { subject, html, text }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
