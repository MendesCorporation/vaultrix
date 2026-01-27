import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword, getUserDEK } from '@/lib/crypto'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getClientIP, checkRateLimit, RATE_LIMITS } from '@/lib/security'
import { decryptMfaSecret, normalizeMfaToken, verifyMfaToken } from '@/lib/security/mfa'
import { normalizeEmail } from '@/lib/utils/email'
import type { UserRole } from '@prisma/client'

// MFA error codes as constants
const MFA_ERRORS = {
  SETUP_REQUIRED: 'mfa_setup_required',
  REQUIRED: 'mfa_required',
  INVALID: 'mfa_invalid',
} as const

// Custom function to throw MFA errors that NextAuth will return to client
function throwMfaError(code: string): never {
  const error = new CredentialsSignin(code)
  error.code = code
  throw error
}

declare module 'next-auth' {
  interface User {
    id?: string
    email?: string | null
    name?: string | null
    role?: UserRole
    locale?: string | null
  }

  interface Session {
    user: User & {
      id: string
      role: UserRole
      locale?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    email?: string
    role?: UserRole
    locale?: string | null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',
    maxAge: 15 * 60, // 15 minutos
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        otp: { label: 'OTP', type: 'text' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email as string
        const password = credentials.password as string
        const clientIP = getClientIP(request)
        const normalizedEmail = normalizeEmail(email)

        // Rate limiting por IP
        const rateLimitKey = `login:${clientIP}`
        const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.login)

        if (!rateLimit.success) {
          await createAuditLog({
            action: 'LOGIN_FAILED',
            ipAddress: clientIP,
            userAgent: request?.headers?.get?.('user-agent') || undefined,
            metadata: { email, reason: 'rate_limit_exceeded', retryAfter: rateLimit.retryAfter },
          })
          return null
        }

        // Buscar usuário
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        })

        if (!user || !user.isActive) {
          // Log tentativa falha
          await createAuditLog({
            action: 'LOGIN_FAILED',
            ipAddress: clientIP,
            userAgent: request?.headers?.get?.('user-agent') || undefined,
            metadata: { email: normalizedEmail, reason: !user ? 'user_not_found' : 'user_inactive' },
          })
          return null
        }

        // Verificar senha
        const isValid = await verifyPassword(password, user.passwordHash)
        if (!isValid) {
          await createAuditLog({
            userId: user.id,
            action: 'LOGIN_FAILED',
            ipAddress: clientIP,
            userAgent: request?.headers?.get?.('user-agent') || undefined,
            metadata: { reason: 'invalid_password' },
          })
          return null
        }


        const mfaRequiredConfig = await prisma.systemConfig.findUnique({
          where: { key: 'mfa_required' },
          select: { value: true },
        })
        const mfaRequired =
          mfaRequiredConfig?.value === true || mfaRequiredConfig?.value === 'true'
        const requiresMfa = mfaRequired || user.mfaEnabled

        if (requiresMfa) {
          const otp = normalizeMfaToken(String(credentials.otp ?? ''))
          const secret = user.mfaSecret ? decryptMfaSecret(user.mfaSecret) : ''

          if (!user.mfaEnabled) {
            // User needs to set up MFA first
            if (!secret || !otp) {
              throwMfaError(MFA_ERRORS.SETUP_REQUIRED)
            }
          } else if (!otp) {
            // User has MFA enabled, needs to provide code
            throwMfaError(MFA_ERRORS.REQUIRED)
          }

          if (!secret || !otp || !verifyMfaToken(otp, secret)) {
            await createAuditLog({
              userId: user.id,
              action: 'LOGIN_FAILED',
              ipAddress: clientIP,
              userAgent: request?.headers?.get?.('user-agent') || undefined,
              metadata: { reason: 'mfa_invalid' },
            })
            throwMfaError(MFA_ERRORS.INVALID)
          }

          if (!user.mfaEnabled) {
            await prisma.user.update({
              where: { id: user.id },
              data: { mfaEnabled: true },
            })
            await createAuditLog({
              userId: user.id,
              action: 'MFA_ENABLED',
              ipAddress: clientIP,
              userAgent: request?.headers?.get?.('user-agent') || undefined,
            })
          }
        }

        // Atualizar último login
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            lastLoginIp: clientIP,
          },
        })

        // Log de sucesso
        await createAuditLog({
          userId: user.id,
          action: 'LOGIN',
          ipAddress: clientIP,
          userAgent: request?.headers?.get?.('user-agent') || undefined,
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          locale: user.locale,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email ?? undefined
        token.role = user.role
        token.locale = user.locale ?? null
      }
      if (!token.id && token.sub) {
        token.id = token.sub
      }
      if (!token.role) {
        token.role = 'USER'
      }
      return token
    },
    async session({ session, token }) {
      const tokenId = token.id ?? token.sub ?? ''
      session.user.id = tokenId
      session.user.role = (token.role as UserRole) ?? 'USER'
      session.user.locale = (token.locale as string | null | undefined) ?? null
      return session
    },
  },
  events: {
    async signOut(message) {
      const token = 'token' in message ? message.token : null
      const userId = token?.id ?? token?.sub
      if (userId) {
        await createAuditLog({
          userId,
          action: 'LOGOUT',
          ipAddress: 'unknown',
        })
      }
    },
  },
})
