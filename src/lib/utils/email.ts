export function normalizeEmail(input?: string | null): string {
  if (!input) {
    return ''
  }

  return input.trim().toLowerCase()
}
