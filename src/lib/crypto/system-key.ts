import 'server-only'
import crypto from 'crypto'
import { encrypt, decrypt, serialize, deserialize, type EncryptedData } from './aes'

// Cache da chave do sistema para evitar re-derivação
let systemKeyCache: Buffer | null = null

/**
 * Deriva a chave do sistema a partir do ENCRYPTION_PEPPER
 * Esta chave é usada para criptografar dados compartilhados
 * (credenciais, senhas de máquinas, chaves SSH)
 */
function getSystemKey(): Buffer {
  if (systemKeyCache) {
    return systemKeyCache
  }

  const pepper = process.env.ENCRYPTION_PEPPER
  if (!pepper) {
    throw new Error('ENCRYPTION_PEPPER environment variable is not set')
  }

  // Deriva uma chave de 256 bits usando PBKDF2
  // O salt é fixo pois precisamos da mesma chave em todas as instâncias
  const salt = 'invetrix-system-key-v1'
  systemKeyCache = crypto.pbkdf2Sync(pepper, salt, 100000, 32, 'sha256')

  return systemKeyCache
}

/**
 * Criptografa dados sensíveis para armazenamento
 * Usa a chave do sistema derivada do ENCRYPTION_PEPPER
 */
export function encryptSystemData(plaintext: string): string {
  if (!plaintext) return ''

  const key = getSystemKey()
  const encrypted = encrypt(plaintext, key)
  return serialize(encrypted)
}

/**
 * Descriptografa dados sensíveis do armazenamento
 * Usa a chave do sistema derivada do ENCRYPTION_PEPPER
 */
export function decryptSystemData(ciphertext: string): string {
  if (!ciphertext) return ''

  // Verifica se é um dado criptografado (JSON) ou texto plano (legado)
  try {
    const encrypted = deserialize(ciphertext)
    // Verifica se tem a estrutura esperada
    if (!encrypted.iv || !encrypted.ciphertext || !encrypted.tag) {
      // Não é um dado criptografado válido, retorna como está
      return ciphertext
    }

    const key = getSystemKey()
    return decrypt(encrypted, key)
  } catch (error) {
    // Se falhar ao parsear JSON, é texto plano (dados legados)
    return ciphertext
  }
}

/**
 * Verifica se um valor está criptografado
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false

  try {
    const parsed = JSON.parse(value)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'iv' in parsed &&
      'ciphertext' in parsed &&
      'tag' in parsed &&
      'version' in parsed
    )
  } catch {
    return false
  }
}

/**
 * Migra dados legados (texto plano) para criptografado
 * Retorna o valor criptografado se era texto plano,
 * ou o valor original se já estava criptografado
 */
export function migrateToEncrypted(value: string): string {
  if (!value) return ''

  if (isEncrypted(value)) {
    return value
  }

  return encryptSystemData(value)
}
