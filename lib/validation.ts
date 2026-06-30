/** Basic e-mail format check (local@domain.tld). */
export function isValidEmail(value: string): boolean {
  const email = value.trim()
  if (!email || email.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Informe um e-mail.'
  if (!isValidEmail(email)) return 'Informe um e-mail válido.'
  return null
}
