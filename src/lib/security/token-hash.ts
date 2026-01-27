import 'server-only'
import crypto from 'crypto'

/**
 * Gera um hash SHA-256 de um token
 * Usado para armazenar tokens de forma segura no banco de dados
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Verifica se um token corresponde a um hash
 */
export function verifyToken(token: string, hash: string): boolean {
  const tokenHash = hashToken(token)
  return crypto.timingSafeEqual(
    Buffer.from(tokenHash, 'hex'),
    Buffer.from(hash, 'hex')
  )
}

/**
 * Gera um token seguro de tamanho especificado
 * @param bytes - Número de bytes (padrão 32 = 64 caracteres hex)
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}
