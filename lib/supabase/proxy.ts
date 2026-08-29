import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/', '/login', '/register', '/recuperar-senha', '/auth', '/planos', '/status']
const AUTH_CALLBACK_PATH = '/auth/callback'
const AUTH_CONFIRM_PATH = '/auth/confirm'

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function safeNextPath(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('://')) {
    return fallback
  }
  return value
}

/** Auth emails often land on Site URL (`/`) with ?code= instead of /auth/callback. */
function redirectAuthEmailParams(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl
  if (pathname === AUTH_CALLBACK_PATH || pathname === AUTH_CONFIRM_PATH) return null

  const errorCode = searchParams.get('error_code')
  const errorDescription = searchParams.get('error_description')
  const error = searchParams.get('error')
  const isSupabaseAuthError =
    !!errorCode || error === 'access_denied' || !!errorDescription
  if (isSupabaseAuthError) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    const expired =
      errorCode === 'otp_expired' || (errorDescription ?? '').toLowerCase().includes('expired')
    url.searchParams.set(
      'error',
      expired
        ? 'Este link expirou ou já foi usado. Solicite um novo em Esqueceu a senha?'
        : 'Não foi possível validar o link. Tente solicitar um novo.',
    )
    return NextResponse.redirect(url)
  }

  const code = searchParams.get('code')
  if (code) {
    const url = request.nextUrl.clone()
    url.pathname = AUTH_CALLBACK_PATH
    url.search = ''
    url.searchParams.set('code', code)
    url.searchParams.set('next', safeNextPath(searchParams.get('next'), '/auth/atualizar-senha'))
    return NextResponse.redirect(url)
  }

  const tokenHash = searchParams.get('token_hash')
  if (tokenHash) {
    const url = request.nextUrl.clone()
    url.pathname = AUTH_CONFIRM_PATH
    url.search = ''
    url.searchParams.set('token_hash', tokenHash)
    url.searchParams.set('type', searchParams.get('type') ?? 'recovery')
    url.searchParams.set('next', safeNextPath(searchParams.get('next'), '/auth/atualizar-senha'))
    return NextResponse.redirect(url)
  }

  return null
}

export async function updateSession(request: NextRequest) {
  const authEmailRedirect = redirectAuthEmailParams(request)
  if (authEmailRedirect) return authEmailRedirect

  let supabaseResponse = NextResponse.next({ request })

  // With Fluid compute, don't put this client in a global variable.
  // Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and getClaims().
  // getClaims() validates the JWT signature and refreshes the session.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
