'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { validateEmail } from '@/lib/validation'

type Mode = 'login' | 'register'

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [emailError, setEmailError] = useState<string | null>(null)

  const isLogin = mode === 'login'
  const showResetLink = isLogin && failedAttempts >= 3
  const resetPasswordHref = `/recuperar-senha${email ? `?email=${encodeURIComponent(email)}` : ''}`

  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError) setError(urlError)
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    const trimmedEmail = email.trim()
    const emailValidationError = validateEmail(trimmedEmail)
    if (emailValidationError) {
      setEmailError(emailValidationError)
      setError(emailValidationError)
      return
    }

    setLoading(true)

    const supabase = createClient()
    const redirectTo = searchParams.get('redirectTo') || '/app'

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
        if (error) throw error
        setFailedAttempts(0)
        router.push(redirectTo)
        router.refresh()
      } else {
        if (password !== confirmPassword) {
          setError('As senhas não coincidem.')
          setLoading(false)
          return
        }

        const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password })
        if (error) throw error
        // If email confirmation is disabled, a session is returned immediately.
        if (data.session) {
          router.push(redirectTo)
          router.refresh()
        } else {
          setInfo('Conta criada! Verifique seu e-mail para confirmar o acesso.')
        }
      }
    } catch (err) {
      const message = (err as Error).message
      setError(translateError(message))
      if (isLogin && message.toLowerCase().includes('invalid login credentials')) {
        setFailedAttempts((n) => n + 1)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400 shadow-lg">
            <svg className="h-6 w-6 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">FindProduct</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isLogin ? 'Entre na sua conta' : 'Comece grátis com 1 monitor'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFailedAttempts(0)
                if (emailError) setEmailError(null)
              }}
              onBlur={() => setEmailError(email.trim() ? validateEmail(email) : null)}
              placeholder="voce@email.com"
              aria-invalid={!!emailError}
              className={`form-input ${emailError ? 'form-input-error' : ''}`}
            />
            {emailError && (
              <span className="text-[11px] text-red-600 dark:text-red-400">{emailError}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="form-input"
            />
            {!isLogin && (
              <span className="text-[11px] text-zinc-400">Mínimo de 6 caracteres</span>
            )}
          </div>

          {!isLogin && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Confirmar senha
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
              {error}
              {showResetLink && (
                <p className="mt-2 border-t border-red-200/60 pt-2 dark:border-red-900/40">
                  Esqueceu a senha?{' '}
                  <Link href={resetPasswordHref} className="font-semibold text-yellow-700 hover:underline dark:text-yellow-400">
                    Redefinir senha
                  </Link>
                </p>
              )}
            </div>
          )}
          {info && (
            <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-400">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 active:scale-[.98] disabled:opacity-50"
          >
            {loading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : isLogin ? (
              'Entrar'
            ) : (
              'Criar conta'
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {isLogin ? (
            <>
              Não tem conta?{' '}
              <Link href="/register" className="font-semibold text-yellow-600 hover:underline dark:text-yellow-400">
                Cadastre-se
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{' '}
              <Link href="/login" className="font-semibold text-yellow-600 hover:underline dark:text-yellow-400">
                Entrar
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function translateError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('user already registered')) return 'Este e-mail já está cadastrado.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (m.includes('password should be')) return 'A senha deve ter pelo menos 6 caracteres.'
  return message
}
