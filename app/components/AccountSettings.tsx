'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPlanConfig, formatPlanPrice, isPaidPlan, type PlanId } from '@/lib/plans'
import UpdateCardForm from '@/app/components/UpdateCardForm'

interface Profile {
  email: string | null
  display_name: string | null
  plan: PlanId
  email_alerts: boolean
  created_at: string
  asaas_subscription_id: string | null
}

export default function AccountSettings() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile)
          setDisplayName(data.profile.display_name ?? '')
        } else {
          setError(data.error ?? 'Erro ao carregar perfil')
        }
      })
      .catch(() => setError('Erro ao carregar perfil'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar')
      setProfile(data.profile)
      setSuccess('Nome atualizado.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAccount() {
    if (confirmDelete !== 'DELETAR') {
      setError('Digite DELETAR para confirmar a exclusão.')
      return
    }

    setDeleting(true)
    setError(null)

    try {
      const res = await fetch('/api/profile', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao excluir conta')

      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setDeleting(false)
    }
  }

  const plan = profile ? getPlanConfig(profile.plan) : null

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/app"
            className="flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </Link>
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-white">Configurações da conta</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {loading ? (
          <p className="text-sm text-zinc-500">Carregando...</p>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Profile */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Seu perfil</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Atualize como você aparece no app.
              </p>

              <form onSubmit={handleSave} className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={profile?.email ?? ''}
                    disabled
                    className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2.5 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="display_name" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Nome
                  </label>
                  <input
                    id="display_name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Como quer ser chamado"
                    maxLength={80}
                    className="form-input"
                  />
                </div>

                {plan && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/40 dark:bg-green-950/20">
                    <p className="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-400">
                      Plano ativo
                    </p>
                    <p className="mt-1 text-sm font-semibold text-green-900 dark:text-green-100">
                      {plan.name}
                      {plan.priceMonthly > 0 && (
                        <span className="font-normal text-green-800 dark:text-green-300">
                          {' '}
                          · {formatPlanPrice(plan)}
                        </span>
                      )}
                    </p>
                    <Link
                      href="/planos"
                      className="mt-2 inline-block text-xs text-yellow-700 hover:underline dark:text-yellow-400"
                    >
                      Ver ou trocar de plano
                    </Link>
                  </div>
                )}

                {profile?.asaas_subscription_id && isPaidPlan(profile.plan) && (
                  <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      Pagamento
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Troque o cartão usado nas cobranças mensais do Asaas.
                    </p>
                    <div className="mt-3">
                      <UpdateCardForm />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-400">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="self-start rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar nome'}
                </button>
              </form>
            </section>

            {/* Danger zone */}
            <section className="rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900/40 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-red-700 dark:text-red-400">Excluir conta</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Isso remove permanentemente sua conta, monitores e histórico de produtos vistos.
                Se você tiver assinatura paga, ela será cancelada no Asaas e não haverá novas cobranças.
                Buscas compartilhadas com outros usuários permanecem no sistema.
              </p>

              <div className="mt-4 flex flex-col gap-3">
                <label htmlFor="confirm_delete" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Digite <strong>DELETAR</strong> para confirmar
                </label>
                <input
                  id="confirm_delete"
                  type="text"
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  placeholder="DELETAR"
                  className="form-input max-w-xs focus:border-red-400 focus:ring-red-400/20"
                />
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting || confirmDelete !== 'DELETAR'}
                  className="self-start rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-40"
                >
                  {deleting ? 'Excluindo...' : 'Excluir minha conta'}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
