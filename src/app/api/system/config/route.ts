import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getSystemConfig, setConfigValue } from '@/lib/db/queries/system'
import { z } from 'zod'

const configSchema = z.object({
  brandingLogoUrl: z.string().optional().nullable(),
  brandingFaviconUrl: z.string().optional().nullable(),
  publicBaseUrl: z.string().optional().nullable(),
  smtpHost: z.string().optional().nullable(),
  smtpPort: z.number().int().optional().nullable(),
  smtpUser: z.string().optional().nullable(),
  smtpPass: z.string().optional().nullable(),
  smtpFrom: z.string().optional().nullable(),
  smtpSecure: z.boolean().optional().nullable(),
  smtpStarttls: z.boolean().optional().nullable(),
  mfaRequired: z.boolean().optional().nullable(),
})

function isSuperAdmin(role?: string) {
  return role === 'SUPER_ADMIN'
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const config = await getSystemConfig([
    'branding_logo_url',
    'branding_favicon_url',
    'public_base_url',
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_pass',
    'smtp_from',
    'smtp_secure',
    'smtp_starttls',
    'setup_completed',
    'mfa_required',
  ])

  return NextResponse.json({
    brandingLogoUrl: config.branding_logo_url ?? '',
    brandingFaviconUrl: config.branding_favicon_url ?? '',
    publicBaseUrl: config.public_base_url ?? '',
    smtpHost: config.smtp_host ?? '',
    smtpPort: config.smtp_port ?? 587,
    smtpUser: config.smtp_user ?? '',
    smtpPass: config.smtp_pass ?? '',
    smtpFrom: config.smtp_from ?? '',
    smtpSecure: config.smtp_secure ?? false,
    smtpStarttls: config.smtp_starttls ?? false,
    setupCompleted: config.setup_completed ?? false,
    mfaRequired: config.mfa_required ?? false,
  })
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = configSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const data = validation.data

  if (data.brandingLogoUrl !== undefined) {
    await setConfigValue('branding_logo_url', data.brandingLogoUrl || '')
  }
  if (data.brandingFaviconUrl !== undefined) {
    await setConfigValue('branding_favicon_url', data.brandingFaviconUrl || '')
  }
  if (data.publicBaseUrl !== undefined) {
    await setConfigValue('public_base_url', data.publicBaseUrl || '')
  }
  if (data.smtpHost !== undefined) {
    await setConfigValue('smtp_host', data.smtpHost || '')
  }
  if (data.smtpPort !== undefined) {
    await setConfigValue('smtp_port', data.smtpPort || 587)
  }
  if (data.smtpUser !== undefined) {
    await setConfigValue('smtp_user', data.smtpUser || '')
  }
  if (data.smtpPass !== undefined) {
    await setConfigValue('smtp_pass', data.smtpPass || '')
  }
  if (data.smtpFrom !== undefined) {
    await setConfigValue('smtp_from', data.smtpFrom || '')
  }
  if (data.smtpSecure !== undefined) {
    await setConfigValue('smtp_secure', data.smtpSecure)
  }
  if (data.smtpStarttls !== undefined) {
    await setConfigValue('smtp_starttls', data.smtpStarttls)
  }
  if (data.mfaRequired !== undefined) {
    await setConfigValue('mfa_required', data.mfaRequired)
  }

  return NextResponse.json({ success: true })
}
