import 'server-only'

// Regex para validação de IPv4
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

// Regex para validação de IPv6 (simplificado)
const IPV6_REGEX = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/

/**
 * Verifica se uma string é um endereço IP válido
 */
export function isValidIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false
  const trimmed = ip.trim()
  return IPV4_REGEX.test(trimmed) || IPV6_REGEX.test(trimmed)
}

/**
 * Converte IPv6 para IPv4 quando aplicável
 * Ex: ::ffff:192.168.1.1 -> 192.168.1.1
 * Ex: ::1 -> 127.0.0.1
 */
function normalizeIPv6ToIPv4(ip: string): string {
  // Handle IPv6 localhost
  if (ip === '::1') {
    return '127.0.0.1'
  }

  // Match ::ffff:x.x.x.x format (IPv6-mapped IPv4)
  const mappedMatch = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i)
  if (mappedMatch) {
    return mappedMatch[1]
  }

  return ip
}

/**
 * Sanitiza e valida um endereço IP
 * Remove espaços e valida o formato
 * Converte IPv6-mapped IPv4 para IPv4 simples
 */
export function sanitizeIP(ip: string | null | undefined): string | null {
  if (!ip || typeof ip !== 'string') return null

  let trimmed = ip.trim()

  // Converte IPv6-mapped IPv4 para IPv4 puro
  trimmed = normalizeIPv6ToIPv4(trimmed)

  // Se já é um IP válido, retorna
  if (isValidIP(trimmed)) {
    return trimmed
  }

  // Para IPv4, remove porta se presente (ex: 192.168.1.1:8080)
  // Apenas se não contém múltiplos ':' (indicaria IPv6)
  if (!trimmed.includes(':') || (trimmed.match(/:/g) || []).length === 1) {
    const withoutPort = trimmed.split(':')[0]
    if (isValidIP(withoutPort)) {
      return withoutPort
    }
  }

  // Para IPv6 com porta [::1]:8080
  const ipv6WithPortMatch = trimmed.match(/^\[(.+)\]:\d+$/)
  if (ipv6WithPortMatch) {
    const ipv6 = normalizeIPv6ToIPv4(ipv6WithPortMatch[1])
    if (isValidIP(ipv6)) {
      return ipv6
    }
  }

  return null
}

/**
 * Obtém o IP do cliente de forma segura
 * Considera proxies reversos confiáveis
 *
 * @param request - Request object com headers
 * @param trustProxy - Se deve confiar em headers de proxy (default: true em produção atrás de proxy)
 * @returns IP do cliente ou 'unknown'
 */
export function getClientIP(request: Request | { headers: Headers } | null, trustProxy = true): string {
  if (!request?.headers) return 'unknown'

  const headers = request.headers

  // Se estamos atrás de um proxy confiável
  if (trustProxy) {
    // X-Forwarded-For pode conter múltiplos IPs: client, proxy1, proxy2
    // O primeiro IP é o cliente original
    const forwarded = headers.get('x-forwarded-for')
    if (forwarded) {
      const ips = forwarded.split(',').map(ip => ip.trim())

      // Valida e retorna o primeiro IP válido
      for (const ip of ips) {
        const sanitized = sanitizeIP(ip)
        if (sanitized) {
          return sanitized
        }
      }
    }

    // X-Real-IP é definido por alguns proxies (nginx)
    const realIP = headers.get('x-real-ip')
    if (realIP) {
      const sanitized = sanitizeIP(realIP)
      if (sanitized) {
        return sanitized
      }
    }

    // CF-Connecting-IP para Cloudflare
    const cfIP = headers.get('cf-connecting-ip')
    if (cfIP) {
      const sanitized = sanitizeIP(cfIP)
      if (sanitized) {
        return sanitized
      }
    }

    // True-Client-IP para Akamai e Cloudflare Enterprise
    const trueClientIP = headers.get('true-client-ip')
    if (trueClientIP) {
      const sanitized = sanitizeIP(trueClientIP)
      if (sanitized) {
        return sanitized
      }
    }
  }

  return 'unknown'
}

/**
 * Gera um identificador único para rate limiting
 * Combina IP com outros fatores para identificação mais precisa
 */
export function getRateLimitIdentifier(
  request: Request,
  suffix?: string
): string {
  const ip = getClientIP(request)
  const userAgent = request.headers.get('user-agent') || 'unknown'

  // Cria um hash simples do user-agent para adicionar contexto
  // sem expor informações sensíveis
  const uaHash = simpleHash(userAgent)

  const identifier = `${ip}:${uaHash}`

  return suffix ? `${identifier}:${suffix}` : identifier
}

/**
 * Hash simples para ofuscação (não criptográfico)
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}
