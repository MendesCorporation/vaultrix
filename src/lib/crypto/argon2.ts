import 'server-only'
import argon2 from 'argon2'
import crypto from 'crypto'

// Configuração do Argon2id conforme OWASP
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3, // 3 iterações
  parallelism: 4, // 4 threads paralelas
  hashLength: 32, // 256 bits
}

const SALT_LENGTH = 16 // 128 bits

/**
 * Gera um salt criptograficamente seguro
 * @returns Salt em formato base64
 */
export function generateSalt(): string {
  return crypto.randomBytes(SALT_LENGTH).toString('base64')
}

/**
 * Cria hash da senha para autenticação
 * @param password - Senha do usuário
 * @returns Hash Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    ...ARGON2_CONFIG,
    salt: crypto.randomBytes(SALT_LENGTH),
  })
}

/**
 * Verifica se a senha corresponde ao hash
 * @param password - Senha fornecida
 * @param hash - Hash armazenado
 * @returns true se a senha está correta
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

/**
 * Deriva uma Master Key a partir da senha e salt
 * Usada para criptografar/descriptografar a DEK
 * @param password - Senha do usuário
 * @param salt - Salt único do usuário (base64)
 * @returns Master Key de 256 bits
 */
export async function deriveMasterKey(
  password: string,
  salt: string
): Promise<Buffer> {
  const saltBuffer = Buffer.from(salt, 'base64')

  const hash = await argon2.hash(password, {
    ...ARGON2_CONFIG,
    salt: saltBuffer,
    raw: true, // Retorna Buffer ao invés de string
  })

  return hash as Buffer
}

/**
 * Cria um novo usuário com todas as chaves necessárias
 * @param password - Senha do usuário
 * @returns Dados para armazenamento do usuário
 */
export async function createUserCredentials(password: string): Promise<{
  passwordHash: string
  salt: string
  encryptedDEK: string
}> {
  // 1. Gerar salt único para derivação da Master Key
  const salt = generateSalt()

  // 2. Criar hash da senha para autenticação
  const passwordHash = await hashPassword(password)

  // 3. Derivar Master Key
  const masterKey = await deriveMasterKey(password, salt)

  // 4. Gerar DEK (Data Encryption Key) aleatória
  const { generateKey, encryptForStorage } = await import('./aes')
  const dek = generateKey()

  // 5. Criptografar DEK com Master Key
  const encryptedDEK = encryptForStorage(dek.toString('base64'), masterKey)

  return {
    passwordHash,
    salt,
    encryptedDEK,
  }
}

/**
 * Obtém a DEK do usuário após autenticação
 * @param password - Senha do usuário
 * @param salt - Salt do usuário
 * @param encryptedDEK - DEK criptografada armazenada
 * @returns DEK descriptografada
 */
export async function getUserDEK(
  password: string,
  salt: string,
  encryptedDEK: string
): Promise<Buffer> {
  // 1. Derivar Master Key
  const masterKey = await deriveMasterKey(password, salt)

  // 2. Descriptografar DEK
  const { decryptFromStorage } = await import('./aes')
  const dekBase64 = decryptFromStorage(encryptedDEK, masterKey)

  return Buffer.from(dekBase64, 'base64')
}

/**
 * Altera a senha do usuário, re-criptografando a DEK
 * @param oldPassword - Senha atual
 * @param newPassword - Nova senha
 * @param salt - Salt atual
 * @param encryptedDEK - DEK criptografada atual
 * @returns Novos dados de credenciais
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string,
  salt: string,
  encryptedDEK: string
): Promise<{
  passwordHash: string
  salt: string
  encryptedDEK: string
}> {
  // 1. Obter DEK atual
  const dek = await getUserDEK(oldPassword, salt, encryptedDEK)

  // 2. Gerar novo salt
  const newSalt = generateSalt()

  // 3. Criar novo hash de senha
  const passwordHash = await hashPassword(newPassword)

  // 4. Derivar nova Master Key
  const newMasterKey = await deriveMasterKey(newPassword, newSalt)

  // 5. Re-criptografar DEK com nova Master Key
  const { encryptForStorage } = await import('./aes')
  const newEncryptedDEK = encryptForStorage(dek.toString('base64'), newMasterKey)

  return {
    passwordHash,
    salt: newSalt,
    encryptedDEK: newEncryptedDEK,
  }
}
