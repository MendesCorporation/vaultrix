import nodemailer from 'nodemailer'
import { getSystemConfig } from '@/lib/db/queries/system'
import { getDictionary, translate } from '@/lib/i18n'
import { normalizeLocale } from '@/lib/i18n/locales'

export async function getSmtpConfig() {
  const config = await getSystemConfig([
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_pass',
    'smtp_from',
    'smtp_secure',
    'smtp_starttls',
  ])

  const host = config.smtp_host as string | undefined
  const port = Number(config.smtp_port || 587)
  const user = config.smtp_user as string | undefined
  const pass = config.smtp_pass as string | undefined
  const from = (config.smtp_from as string | undefined) || ''
  const secure = Boolean(config.smtp_secure)
  const starttls = Boolean(config.smtp_starttls)

  return { host, port, user, pass, from, secure, starttls }
}

function resolveAssetUrl(assetUrl?: string, publicBaseUrl?: string) {
  if (!assetUrl) return undefined
  
  // Se já é URL absoluta, retorna
  if (assetUrl.startsWith('http://') || assetUrl.startsWith('https://')) {
    return assetUrl
  }
  
  // Se não tem base URL configurada, não pode resolver
  if (!publicBaseUrl) {
    console.warn('public_base_url not configured, email images may not load')
    return undefined
  }
  
  // Resolve URL relativa
  const base = publicBaseUrl.replace(/\/$/, '')
  const path = assetUrl.startsWith('/') ? assetUrl : `/${assetUrl}`
  return `${base}${path}`
}

export async function sendInviteEmail(params: {
  to: string
  name: string
  inviteUrl: string
  locale?: string | null
}) {
  const smtp = await getSmtpConfig()
  const branding = await getSystemConfig(['branding_logo_url', 'public_base_url'])
  const baseUrl =
    (branding.public_base_url as string | undefined) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL
  const logoUrl = resolveAssetUrl(
    branding.branding_logo_url as string | undefined,
    baseUrl
  )
  const locale = normalizeLocale(params.locale)
  const dictionary = getDictionary(locale)
  const t = (key: string, values?: Record<string, string | number>) => translate(dictionary, key, values)

  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    throw new Error('SMTP not configured')
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.starttls,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  })

  const subject = t('emails.invite.subject')
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="Vaultrix" style="height:40px; margin-bottom:16px;"/>`
    : `<div style="font-weight:700; color:#e11d48; margin-bottom:16px;">VAULTRIX</div>`

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f6f6f9; padding: 24px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px;">
        ${logoBlock}
        <h2 style="color:#111827; margin-top:0;">${t('emails.invite.greeting', { name: params.name })}</h2>
        <p style="color:#4b5563;">${t('emails.invite.intro')}</p>
        <p style="color:#4b5563;">${t('emails.invite.instruction')}</p>
        <div style="margin:24px 0;">
          <a href="${params.inviteUrl}" style="background:#e11d48; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; display:inline-block;">
            ${t('emails.invite.cta')}
          </a>
        </div>
        <p style="color:#6b7280; font-size:12px;">${t('emails.invite.footer')}</p>
      </div>
    </div>
  `

  await transporter.sendMail({
    from: smtp.from,
    to: params.to,
    subject,
    html,
  })
}

export async function sendPasswordResetEmail(params: {
  to: string
  name: string
  resetUrl: string
  locale?: string | null
}) {
  const smtp = await getSmtpConfig()
  const branding = await getSystemConfig(['branding_logo_url', 'public_base_url'])
  const baseUrl =
    (branding.public_base_url as string | undefined) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL
  const logoUrl = resolveAssetUrl(
    branding.branding_logo_url as string | undefined,
    baseUrl
  )
  const locale = normalizeLocale(params.locale)
  const dictionary = getDictionary(locale)
  const t = (key: string, values?: Record<string, string | number>) => translate(dictionary, key, values)

  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    throw new Error('SMTP not configured')
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.starttls,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  })

  const subject = t('emails.passwordReset.subject')
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="Vaultrix" style="height:40px; margin-bottom:16px;"/>`
    : `<div style="font-weight:700; color:#e11d48; margin-bottom:16px;">VAULTRIX</div>`

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f6f6f9; padding: 24px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px;">
        ${logoBlock}
        <h2 style="color:#111827; margin-top:0;">${t('emails.passwordReset.greeting', { name: params.name })}</h2>
        <p style="color:#4b5563;">${t('emails.passwordReset.intro')}</p>
        <p style="color:#4b5563;">${t('emails.passwordReset.instruction')}</p>
        <div style="margin:24px 0;">
          <a href="${params.resetUrl}" style="background:#e11d48; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; display:inline-block;">
            ${t('emails.passwordReset.cta')}
          </a>
        </div>
        <p style="color:#6b7280; font-size:12px;">${t('emails.passwordReset.expiry')}</p>
        <p style="color:#6b7280; font-size:12px;">${t('emails.passwordReset.footer')}</p>
      </div>
    </div>
  `

  await transporter.sendMail({
    from: smtp.from,
    to: params.to,
    subject,
    html,
  })
}

export async function sendAlertEmail(params: {
  to: string
  name: string
  alertName: string
  locale?: string | null
  title: string
  description: string
  machineName: string
  machineIp?: string | null
  details?: Array<{ label: string; value: string }>
}) {
  const smtp = await getSmtpConfig()
  const branding = await getSystemConfig(['branding_logo_url', 'public_base_url'])
  const baseUrl =
    (branding.public_base_url as string | undefined) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL
  const logoUrl = resolveAssetUrl(
    branding.branding_logo_url as string | undefined,
    baseUrl
  )
  const locale = normalizeLocale(params.locale)
  const dictionary = getDictionary(locale)
  const t = (key: string, values?: Record<string, string | number>) => translate(dictionary, key, values)

  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    throw new Error('SMTP not configured')
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.starttls,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  })

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="Vaultrix" style="height:40px; margin-bottom:16px;"/>`
    : `<div style="font-weight:700; color:#e11d48; margin-bottom:16px;">VAULTRIX</div>`

  const detailsRows = params.details?.length
    ? params.details
        .map(
          (detail) => `
            <tr>
              <td style="padding:6px 0; color:#6b7280; font-size:13px;">${detail.label}</td>
              <td style="padding:6px 0; color:#111827; font-size:13px; text-align:right;">${detail.value}</td>
            </tr>
          `
        )
        .join('')
    : ''

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f6f6f9; padding: 24px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px;">
        ${logoBlock}
        <p style="color:#9ca3af; font-size:12px; margin:0 0 8px;">${t('emails.alert.greeting', { name: params.name })}</p>
        <h2 style="color:#111827; margin:0 0 8px;">${params.title}</h2>
        <p style="color:#4b5563; margin:0 0 16px;">${params.description}</p>

        <div style="background:#f9fafb; border-radius:10px; padding:16px; border:1px solid #e5e7eb;">
          <p style="margin:0 0 8px; color:#6b7280; font-size:13px;">${t('emails.alert.machineLabel')}</p>
          <p style="margin:0; font-weight:600; color:#111827;">${params.machineName}</p>
          ${params.machineIp ? `<p style="margin:4px 0 0; color:#6b7280; font-size:13px;">${t('emails.alert.ipLabel')}: ${params.machineIp}</p>` : ''}
          ${detailsRows ? `<table style="width:100%; margin-top:12px;">${detailsRows}</table>` : ''}
        </div>

        <p style="color:#9ca3af; font-size:12px; margin-top:16px;">${t('emails.alert.footer')}</p>
      </div>
    </div>
  `

  await transporter.sendMail({
    from: smtp.from,
    to: params.to,
    subject: t('emails.alert.subject', { name: params.alertName }),
    html,
  })
}
