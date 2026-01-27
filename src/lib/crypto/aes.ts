import 'server-only'
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits - recomendado para GCM
const TAG_LENGTH = 16 // 128 bits
const KEY_LENGTH = 32 // 256 bits

export interface EncryptedData {
  version: number
  iv: string
  ciphertext: string
  tag: string
}

/**
 * Criptografa dados usando AES-256-GCM
 * @param plaintext - Texto a ser criptografado
 * @param key - Chave de 256 bits (32 bytes)
 * @returns Dados criptografados com IV, ciphertext e tag
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedData {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes (256 bits)`)
  }

  // Gerar IV aleatório único para cada operação
  const iv = crypto.randomBytes(IV_LENGTH)

  // Criar cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  })

  // Criptografar
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  // Obter tag de autenticação
  const tag = cipher.getAuthTag()

  return {
    version: 1,
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  }
}

/**
 * Descriptografa dados usando AES-256-GCM
 * @param encryptedData - Dados criptografados
 * @param key - Chave de 256 bits (32 bytes)
 * @returns Texto original
 */
export function decrypt(encryptedData: EncryptedData, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes (256 bits)`)
  }

  const iv = Buffer.from(encryptedData.iv, 'base64')
  const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64')
  const tag = Buffer.from(encryptedData.tag, 'base64')

  // Criar decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  })

  // Definir tag de autenticação
  decipher.setAuthTag(tag)

  // Descriptografar
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

/**
 * Serializa dados criptografados para armazenamento
 * @param data - Dados criptografados
 * @returns String serializada
 */
export function serialize(data: EncryptedData): string {
  return JSON.stringify(data)
}

/**
 * Deserializa dados criptografados do armazenamento
 * @param serialized - String serializada
 * @returns Dados criptografados
 */
export function deserialize(serialized: string): EncryptedData {
  return JSON.parse(serialized) as EncryptedData
}

/**
 * Criptografa e serializa para armazenamento direto no banco
 * @param plaintext - Texto a ser criptografado
 * @param key - Chave de 256 bits
 * @returns String para armazenar no banco
 */
export function encryptForStorage(plaintext: string, key: Buffer): string {
  const encrypted = encrypt(plaintext, key)
  return serialize(encrypted)
}

/**
 * Deserializa e descriptografa dados do banco
 * @param stored - String armazenada no banco
 * @param key - Chave de 256 bits
 * @returns Texto original
 */
export function decryptFromStorage(stored: string, key: Buffer): string {
  const encrypted = deserialize(stored)
  return decrypt(encrypted, key)
}

/**
 * Gera uma chave aleatória de 256 bits
 * @returns Buffer com chave de 32 bytes
 */
export function generateKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH)
}

/**
 * Gera uma senha segura
 * @param length - Tamanho da senha (padrão 24)
 * @param options - Opções de caracteres
 * @returns Senha gerada
 */
export function generatePassword(
  length: number = 24,
  options: {
    uppercase?: boolean
    lowercase?: boolean
    numbers?: boolean
    symbols?: boolean
  } = {}
): string {
  const {
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
  } = options

  let charset = ''
  if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz'
  if (numbers) charset += '0123456789'
  if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?'

  if (charset.length === 0) {
    charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  }

  const randomBytes = crypto.randomBytes(length)
  let password = ''

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length]
  }

  return password
}
