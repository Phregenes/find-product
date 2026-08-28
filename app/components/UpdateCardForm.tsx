'use client'

import { useEffect, useState } from 'react'
import {
  digitsOnly,
  formatAddressNumber,
  formatCardNumber,
  formatCep,
  formatCpfCnpj,
  formatCvv,
  formatExpiry,
  formatHolderName,
  formatPhone,
  validateCheckoutFields,
} from '@/lib/checkout-masks'

const inputClass =
  'mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white'

function formatBrand(brand: string | null): string {
  if (!brand) return 'Cartão'
  const map: Record<string, string> = {
    VISA: 'Visa',
    MASTERCARD: 'Mastercard',
    ELO: 'Elo',
    AMEX: 'American Express',
    HIPERCARD: 'Hipercard',
    DINERS: 'Diners',
    DISCOVER: 'Discover',
  }
  return map[brand.toUpperCase()] ?? brand
}

export default function UpdateCardForm() {
  const [open, setOpen] = useState(false)
  const [cardSummary, setCardSummary] = useState<{
    lastDigits: string
    brand: string | null
  } | null>(null)
  const [cardLoading, setCardLoading] = useState(true)
  const [holderName, setHolderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [ccv, setCvv] = useState('')
  const [cpf, setCpf] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [addressNumber, setAddressNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function loadCard() {
    setCardLoading(true)
    try {
      const res = await fetch('/api/billing/card')
      const data = await res.json()
      setCardSummary(data.card ?? null)
    } catch {
      setCardSummary(null)
    } finally {
      setCardLoading(false)
    }
  }

  useEffect(() => {
    void loadCard()
  }, [])

  function resetForm() {
    setHolderName('')
    setCardNumber('')
    setExpiry('')
    setCvv('')
    setCpf('')
    setPostalCode('')
    setAddressNumber('')
    setPhone('')
  }

  async function handleSubmit() {
    setError(null)
    setSuccess(null)

    const validationError = validateCheckoutFields({
      holderName,
      cardNumber,
      expiry,
      ccv,
      cpfCnpj: cpf,
      postalCode,
      addressNumber,
      phone,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/billing/update-card', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          holderName: holderName.trim(),
          cardNumber: digitsOnly(cardNumber),
          expiry,
          ccv: digitsOnly(ccv),
          cpfCnpj: digitsOnly(cpf),
          postalCode: digitsOnly(postalCode),
          addressNumber: addressNumber.trim(),
          phone: digitsOnly(phone),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Falha ao atualizar cartão')
        return
      }
      resetForm()
      setOpen(false)
      setSuccess('Cartão atualizado. As próximas cobranças usarão este cartão.')
      await loadCard()
    } catch {
      setError('Não foi possível conectar ao servidor. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Cartão atual
        </p>
        {cardLoading ? (
          <p className="mt-1 text-sm text-zinc-500">Consultando Asaas…</p>
        ) : cardSummary ? (
          <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
            {formatBrand(cardSummary.brand)} ······ {cardSummary.lastDigits}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">
            Ainda não há cobrança com cartão para exibir (só bandeira e final).
          </p>
        )}
      </div>

      {success && (
        <p className="rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-400">
          {success}
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setError(null)
            setSuccess(null)
          }}
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
        >
          Atualizar cartão de crédito
        </button>
      ) : (
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Novo cartão
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Não há cobrança agora — só troca o cartão das próximas renovações.
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
              {error}
            </p>
          )}

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Nome no cartão</span>
            <input
              type="text"
              autoComplete="cc-name"
              maxLength={64}
              placeholder="Como está no cartão"
              value={holderName}
              onChange={(e) => setHolderName(formatHolderName(e.target.value))}
              className={inputClass}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Número do cartão</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              maxLength={19}
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Validade</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="cc-exp"
                maxLength={5}
                placeholder="MM/AA"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">CVV</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="cc-csc"
                maxLength={4}
                placeholder="123"
                value={ccv}
                onChange={(e) => setCvv(formatCvv(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">CPF ou CNPJ</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={18}
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpfCnpj(e.target.value))}
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">CEP</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={9}
                placeholder="00000-000"
                value={postalCode}
                onChange={(e) => setPostalCode(formatCep(e.target.value))}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Número</span>
              <input
                type="text"
                maxLength={10}
                placeholder="123"
                value={addressNumber}
                onChange={(e) => setAddressNumber(formatAddressNumber(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Telefone</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={15}
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className={inputClass}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-50"
            >
              {loading ? 'Atualizando…' : 'Salvar novo cartão'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
                resetForm()
              }}
              disabled={loading}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
