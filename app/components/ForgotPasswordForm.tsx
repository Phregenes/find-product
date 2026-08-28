'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSiteUrl } from '@/lib/site'
import { getAuthErrorMessage } from '@/lib/auth-errors'
import { validateEmail } from '@/lib/validation'

export default function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    const emailValidationError = validateEmail(trimmedEmail)
    if (emailValidationError) {
      setEmailError(emailValidationError)
      setError(emailValidationError)
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const redirectTo = `${getSiteUrl()}/auth/callback?next=/auth/atualizar-senha`
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, { redirectTo })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400 shadow-lg">
            <svg className="h-6 w-6 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Redefinir senha</h1>
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            Enviaremos um link para o seu e-mail.
          </p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-green-100 bg-green-50 p-6 text-sm text-green-800 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-300">
            <p className="font-medium">E-mail enviado!</p>
            <p className="mt-2 text-green-700 dark:text-green-400">
              Se existir uma conta com <strong>{email}</strong>, você receberá um link para criar uma nova senha.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block font-semibold text-yellow-600 hover:underline dark:text-yellow-400"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                E-mail da conta
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

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar link'}
            </button>
          </form>
        )}

        {!sent && (
          <p className="mt-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
            <Link href="/login" className="font-semibold text-yellow-600 hover:underline dark:text-yellow-400">
              ← Voltar para o login
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
