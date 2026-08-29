/** Turns Auth/network errors into a string the UI can show. */
export function getAuthErrorMessage(err: unknown): string {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: number }).status)
      : undefined
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code ?? '')
      : ''
  const raw = extractMessage(err)
  const m = raw.toLowerCase()

  if (
    status === 504 ||
    code === 'request_timeout' ||
    m.includes('timeout') ||
    m.includes('deadline') ||
    m.includes('504') ||
    raw === '{}'
  ) {
    return 'O e-mail de confirmação não pôde ser enviado. Tente de novo em alguns segundos.'
  }
  if (m.includes('otp_expired') || m.includes('email link is invalid')) {
    return 'Este link expirou ou já foi usado. Solicite um novo em Esqueceu a senha?'
  }
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('user already registered')) return 'Este e-mail já está cadastrado.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (m.includes('password should be')) return 'A senha deve ter pelo menos 6 caracteres.'
  if (raw && raw !== '{}') return raw
  return 'Não foi possível concluir. Tente de novo.'
}

function extractMessage(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'object' && err !== null) {
    const obj = err as { message?: unknown; msg?: unknown; error_description?: unknown }
    for (const value of [obj.message, obj.msg, obj.error_description]) {
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  return ''
}
