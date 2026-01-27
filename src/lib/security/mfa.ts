import 'server-only'

import { authenticator } from '@otplib/preset-default'
import QRCode from 'qrcode'
import { decryptSystemData, encryptSystemData } from '@/lib/crypto'

authenticator.options = {
  window: 1,
}

export function generateMfaSecret() {
  return authenticator.generateSecret()
}

export function encryptMfaSecret(secret: string) {
  return encryptSystemData(secret)
}

export function decryptMfaSecret(secret: string) {
  return decryptSystemData(secret)
}

export function getOtpAuthUrl(params: {
  accountName: string
  issuer: string
  secret: string
}) {
  return authenticator.keyuri(params.accountName, params.issuer, params.secret)
}

export async function generateQrCodeDataUrl(otpAuthUrl: string) {
  return QRCode.toDataURL(otpAuthUrl, { width: 200, margin: 1 })
}

export function normalizeMfaToken(token: string) {
  return token.replace(/\s+/g, '')
}

export function verifyMfaToken(token: string, secret: string) {
  return authenticator.verify({ token, secret })
}
