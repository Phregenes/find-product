'use client'

import { useState } from 'react'
import { PLANS, formatPlanPrice, type PaidPlanId } from '@/lib/plans'
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

export default function CheckoutForm({
  planId,
  sandbox = false,
}: {
  planId: PaidPlanId
  sandbox?: boolean
}) {
  const plan = PLANS[planId]
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

  async function handleSubscribe() {
    setError(null)

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
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId,
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
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        redirectUrl?: string
      }
      if (!res.ok) {
        setError(data.error ?? 'Falha ao criar assinatura')
        return
      }
      window.location.href = data.redirectUrl ?? '/assinar/ok'
    } catch {
      setError('Não foi possível conectar ao servidor. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {sandbox && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Ambiente de teste (sandbox). No site publicado a cobrança vai para o Asaas de produção.
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Assinatura mensal de <strong>{formatPlanPrice(plan)}</strong>. Pague com cartão sem sair
        do FindProduct — a cobrança renova automaticamente todo mês.
      </p>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Nome no cartão</span>
        <input
          type="text"
          autoComplete="cc-name"
          required
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
          required
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
            required
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
            required
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
          required
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
            required
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
            required
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
          required
          maxLength={15}
          placeholder="(11) 99999-9999"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          className={inputClass}
        />
      </label>

      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-50"
      >
        {loading ? 'Processando…' : `Assinar por ${formatPlanPrice(plan)}`}
      </button>

      <p className="text-center text-xs text-zinc-400">
        Pagamento processado com segurança pelo Asaas.
      </p>
    </div>
  )
}
