import 'server-only'

interface RateLimitEntry {
  count: number
  resetAt: number
}

// Armazena as tentativas em memória
// Em produção com múltiplas instâncias, usar Redis
const rateLimitStore = new Map<string, RateLimitEntry>()

// Limpa entradas expiradas periodicamente
setInterval(() => {
  const now = Date.now()
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  })
}, 60000) // Limpa a cada 1 minuto

export interface RateLimitConfig {
  /** Número máximo de requisições permitidas */
  maxRequests: number
  /** Janela de tempo em milissegundos */
  windowMs: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

/**
 * Verifica rate limit para um identificador
 * @param identifier - Identificador único (IP, userId, etc.)
 * @param config - Configuração do rate limit
 * @returns Resultado da verificação
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const key = identifier

  let entry = rateLimitStore.get(key)

  // Se não existe ou expirou, criar nova entrada
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    }
  }

  // Incrementar contador
  entry.count++
  rateLimitStore.set(key, entry)

  const remaining = Math.max(0, config.maxRequests - entry.count)
  const success = entry.count <= config.maxRequests

  return {
    success,
    remaining,
    resetAt: entry.resetAt,
    retryAfter: success ? undefined : Math.ceil((entry.resetAt - now) / 1000),
  }
}

/**
 * Reseta o rate limit para um identificador
 * @param identifier - Identificador único
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier)
}

// Configurações pré-definidas
export const RATE_LIMITS = {
  /** Login: 5 tentativas por 15 minutos */
  login: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutos
  },
  /** API geral: 100 requisições por minuto */
  api: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minuto
  },
  /** Reveal de senha: 10 por minuto */
  reveal: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minuto
  },
  /** Criação de recursos: 30 por minuto */
  create: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minuto
  },
  /** Setup inicial: 3 tentativas por hora */
  setup: {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hora
  },
} as const

/**
 * Helper para criar resposta de rate limit excedido
 */
export function rateLimitExceededResponse(result: RateLimitResult) {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfter: result.retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt),
      },
    }
  )
}
