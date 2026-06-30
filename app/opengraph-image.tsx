import { ImageResponse } from 'next/og'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

export const alt = `${SITE_NAME} — Monitore anúncios novos no Mercado Livre`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px 80px',
          background: 'linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 32 }}>
          <div
            style={{
              width: 72,
              height: 72,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#facc15',
              borderRadius: 16,
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#18181b"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <span style={{ fontSize: 48, fontWeight: 700, color: '#ffffff' }}>{SITE_NAME}</span>
        </div>
        <p
          style={{
            fontSize: 36,
            fontWeight: 600,
            color: '#facc15',
            lineHeight: 1.3,
            marginBottom: 20,
            maxWidth: 900,
          }}
        >
          Não perca mais um anúncio novo no Mercado Livre
        </p>
        <p style={{ fontSize: 24, color: '#a1a1aa', lineHeight: 1.4, maxWidth: 880 }}>
          {SITE_DESCRIPTION}
        </p>
      </div>
    ),
    { ...size },
  )
}
