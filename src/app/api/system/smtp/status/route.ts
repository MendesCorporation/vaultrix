import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getSystemConfig } from '@/lib/db/queries/system'
import { buildSmtpSignature } from '@/lib/email/smtp-signature'

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const smtpConfig = await getSystemConfig([
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_pass',
    'smtp_from',
    'smtp_secure',
    'smtp_starttls',
    'smtp_verified_signature',
    'smtp_verified_at',
  ])

  const missing: string[] = []
  if (!smtpConfig.smtp_host) missing.push('smtp_host')
  if (!smtpConfig.smtp_user) missing.push('smtp_user')
  if (!smtpConfig.smtp_pass) missing.push('smtp_pass')
  if (!smtpConfig.smtp_from) missing.push('smtp_from')

  const configured = missing.length === 0
  const currentSignature = configured
    ? buildSmtpSignature({
        host: smtpConfig.smtp_host,
        port: Number(smtpConfig.smtp_port || 587),
        user: smtpConfig.smtp_user,
        pass: smtpConfig.smtp_pass,
        from: smtpConfig.smtp_from,
        secure: Boolean(smtpConfig.smtp_secure),
        starttls: Boolean(smtpConfig.smtp_starttls),
      })
    : ''
  const storedSignature = smtpConfig.smtp_verified_signature as string | undefined
  const verified = Boolean(storedSignature && currentSignature && storedSignature === currentSignature)

  return NextResponse.json({
    configured,
    missing,
    secure: Boolean(smtpConfig.smtp_secure),
    starttls: Boolean(smtpConfig.smtp_starttls),
    verified,
    verifiedAt: smtpConfig.smtp_verified_at ?? null,
  })
}
