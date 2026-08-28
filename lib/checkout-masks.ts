export function digitsOnly(value: string, max?: number): string {
  const digits = value.replace(/\D/g, '')
  return max !== undefined ? digits.slice(0, max) : digits
}

export function formatCardNumber(value: string): string {
  const digits = digitsOnly(value, 16)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function formatExpiry(value: string): string {
  const digits = digitsOnly(value, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function formatCvv(value: string): string {
  return digitsOnly(value, 4)
}

export function formatCpfCnpj(value: string): string {
  const digits = digitsOnly(value, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function formatCep(value: string): string {
  const digits = digitsOnly(value, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function formatPhone(value: string): string {
  const digits = digitsOnly(value, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function formatHolderName(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, 64)
}

export function formatAddressNumber(value: string): string {
  return value.replace(/\s+/g, ' ').trimStart().slice(0, 10)
}

function isExpiryInPast(month: number, year: number): boolean {
  const now = new Date()
  const expEnd = new Date(year, month, 0, 23, 59, 59, 999)
  return expEnd < new Date(now.getFullYear(), now.getMonth(), 1)
}

export function validateCheckoutFields(input: {
  holderName: string
  cardNumber: string
  expiry: string
  ccv: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  phone: string
}): string | null {
  const holderName = input.holderName.trim()
  if (holderName.length < 3) return 'Informe o nome como está no cartão (mín. 3 letras).'

  const cardDigits = digitsOnly(input.cardNumber)
  if (cardDigits.length < 13 || cardDigits.length > 16) {
    return 'Número do cartão deve ter entre 13 e 16 dígitos.'
  }

  const expiryMatch = input.expiry.match(/^(\d{2})\/(\d{2})$/)
  if (!expiryMatch) return 'Validade inválida. Use MM/AA.'
  const month = Number(expiryMatch[1])
  const year = 2000 + Number(expiryMatch[2])
  if (month < 1 || month > 12) return 'Mês da validade inválido.'
  if (isExpiryInPast(month, year)) return 'Cartão expirado.'

  const ccv = digitsOnly(input.ccv)
  if (ccv.length < 3 || ccv.length > 4) return 'CVV deve ter 3 ou 4 dígitos.'

  const cpfCnpj = digitsOnly(input.cpfCnpj)
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    return 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.'
  }

  const postalCode = digitsOnly(input.postalCode)
  if (postalCode.length !== 8) return 'CEP deve ter 8 dígitos.'

  if (!input.addressNumber.trim()) return 'Informe o número do endereço.'

  const phone = digitsOnly(input.phone)
  if (phone.length < 10 || phone.length > 11) {
    return 'Telefone deve ter 10 ou 11 dígitos (com DDD).'
  }

  return null
}
