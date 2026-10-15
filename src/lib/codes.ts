const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function isEventCodeShape(value: string): boolean {
  const code = value.trim()
  return code.length >= 6 && code.length <= 12 && !/[%_]/.test(code)
}

export function generateEventCode(length = 8): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length] ?? 'A').join('')
}

export function friendlyClaimError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('claim code not found')) return 'That claim code was not found.'
  if (lower.includes('not authorized')) return 'This email is not authorized for this organization.'
  if (lower.includes('not signed in')) return 'Sign in again to claim an organization.'
  return message
}

export function friendlyCodeError(code: string, message: string): string {
  if (code === '23505' || message.toLowerCase().includes('event_codes_code')) {
    return 'That Event Code is already in use.'
  }
  if (message.toLowerCase().includes('event_codes_code_len')) {
    return 'Event Codes are 6–12 characters.'
  }
  return message
}
