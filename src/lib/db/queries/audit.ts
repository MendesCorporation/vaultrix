import { prisma } from '@/lib/db/prisma'
import type { AuditAction, ResourceType } from '@prisma/client'

interface CreateAuditLogParams {
  userId?: string
  action: AuditAction
  resourceType?: ResourceType
  resourceId?: string
  resourceName?: string
  oldValue?: Record<string, any>
  newValue?: Record<string, any>
  metadata?: Record<string, any>
  ipAddress: string
  userAgent?: string
}

/**
 * Cria um registro de auditoria
 * Dados sensíveis são automaticamente removidos
 */
export async function createAuditLog(params: CreateAuditLogParams) {
  const {
    userId,
    action,
    resourceType,
    resourceId,
    resourceName,
    oldValue,
    newValue,
    metadata,
    ipAddress,
    userAgent,
  } = params

  // Sanitizar valores sensíveis
  const sanitizedOldValue = oldValue ? sanitizeAuditData(oldValue) : undefined
  const sanitizedNewValue = newValue ? sanitizeAuditData(newValue) : undefined

  return prisma.auditLog.create({
    data: {
      userId,
      action,
      resourceType,
      resourceId,
      resourceName,
      oldValue: sanitizedOldValue,
      newValue: sanitizedNewValue,
      metadata,
      ipAddress,
      userAgent,
    },
  })
}

/**
 * Remove campos sensíveis dos dados de auditoria
 */
function sanitizeAuditData(data: Record<string, any>): Record<string, any> {
  const sensitiveFields = [
    'password',
    'passwordHash',
    'encryptedPass',
    'encryptedDEK',
    'encryptedSSHKey',
    'encryptedUser',
    'salt',
    'mfaSecret',
    'token',
    'secret',
  ]

  const sanitized: Record<string, any> = {}

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditData(value)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

interface GetAuditLogsParams {
  userId?: string
  action?: AuditAction
  resourceType?: ResourceType
  resourceId?: string
  startDate?: Date
  endDate?: Date
  page?: number
  limit?: number
}

/**
 * Busca logs de auditoria com filtros
 */
export async function getAuditLogs(params: GetAuditLogsParams = {}) {
  const {
    userId,
    action,
    resourceType,
    resourceId,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = params

  const where: any = {}

  if (userId) where.userId = userId
  if (action) where.action = action
  if (resourceType) where.resourceType = resourceType
  if (resourceId) where.resourceId = resourceId

  if (startDate || endDate) {
    where.timestamp = {}
    if (startDate) where.timestamp.gte = startDate
    if (endDate) where.timestamp.lte = endDate
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}
