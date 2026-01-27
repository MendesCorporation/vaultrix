import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { auth } from '@/lib/auth/config'
import { getSmtpConfig } from '@/lib/email/mailer'
import { setConfigValue } from '@/lib/db/queries/system'
import { buildSmtpSignature } from '@/lib/email/smtp-signature'

export const runtime = 'nodejs'

function isSuperAdmin(role?: string) {
  return role === 'SUPER_ADMIN'
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const smtp = await getSmtpConfig()
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
      return NextResponse.json(
      { error: 'SMTP não configurado. Preencha host, usuário, senha e remetente.' },
      { status: 400 }
    )
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

  try {
    await transporter.verify()
    const verifiedAt = new Date().toISOString()
    const signature = buildSmtpSignature({
      host: smtp.host,
      port: smtp.port,
      user: smtp.user,
      pass: smtp.pass,
      from: smtp.from,
      secure: smtp.secure,
      starttls: smtp.starttls,
    })

    await Promise.all([
      setConfigValue('smtp_verified_signature', signature),
      setConfigValue('smtp_verified_at', verifiedAt),
    ])

    return NextResponse.json({ message: 'SMTP conectado com sucesso.', verifiedAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao conectar no SMTP.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
