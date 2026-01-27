import crypto from 'crypto'

export function buildSmtpSignature(params: {
  host?: string
  port?: number
  user?: string
  pass?: string
  from?: string
  secure?: boolean
  starttls?: boolean
}) {
  const payload = [
    params.host || '',
    String(params.port ?? ''),
    params.user || '',
    params.pass || '',
    params.from || '',
    params.secure ? '1' : '0',
    params.starttls ? '1' : '0',
  ].join('|')

  return crypto.createHash('sha256').update(payload).digest('hex')
}
