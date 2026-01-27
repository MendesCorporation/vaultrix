import { prisma } from '@/lib/db/prisma'
import type { PermissionAction, ResourceType, UserRole } from '@prisma/client'

type Action = PermissionAction
type Resource = ResourceType

interface PermissionCheck {
  userId: string
  action: Action
  resource: Resource
  resourceId?: string
}

/**
 * Verifica se o usuário tem permissão para uma ação em um recurso
 */
export async function checkPermission(check: PermissionCheck): Promise<boolean> {
  const { userId, action, resource, resourceId } = check

  // Buscar usuário com grupos
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { groups: { include: { group: true } } },
  })

  if (!user || !user.isActive) return false

  // SUPER_ADMIN tem acesso total
  if (user.role === 'SUPER_ADMIN') return true

  // ADMIN tem acesso a tudo exceto gerenciar SUPER_ADMIN
  if (user.role === 'ADMIN') {
    // Admin não pode modificar SUPER_ADMIN
    if (resource === 'USER' && resourceId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: resourceId },
        select: { role: true },
      })
      if (targetUser?.role === 'SUPER_ADMIN') return false
    }
    return true
  }

  // Verificar permissões diretas do usuário
  const directPermission = await prisma.permission.findFirst({
    where: {
      userId,
      resourceType: resource,
      OR: [
        { resourceId: null }, // Permissão global
        { resourceId: resourceId }, // Permissão específica
      ],
      actions: { has: action },
    },
  })

  if (directPermission) return true

  // Verificar permissões via grupos
  const groupIds = user.groups.map((ug) => ug.groupId)
  if (groupIds.length > 0) {
    const groupPermission = await prisma.permission.findFirst({
      where: {
        groupId: { in: groupIds },
        resourceType: resource,
        OR: [
          { resourceId: null },
          { resourceId: resourceId },
        ],
        actions: { has: action },
      },
    })

    if (groupPermission) return true
  }

  return false
}

/**
 * Verifica múltiplas permissões de uma vez
 */
export async function checkMultiplePermissions(
  userId: string,
  checks: Array<{ action: Action; resource: Resource; resourceId?: string }>
): Promise<boolean[]> {
  return Promise.all(
    checks.map((check) =>
      checkPermission({
        userId,
        action: check.action,
        resource: check.resource,
        resourceId: check.resourceId,
      })
    )
  )
}

/**
 * Obtém todas as permissões de um usuário
 */
export async function getUserPermissions(userId: string): Promise<{
  role: UserRole
  directPermissions: Array<{
    resourceType: ResourceType
    resourceId: string | null
    actions: PermissionAction[]
  }>
  groupPermissions: Array<{
    groupName: string
    resourceType: ResourceType
    resourceId: string | null
    actions: PermissionAction[]
  }>
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      permissions: {
        select: {
          resourceType: true,
          resourceId: true,
          actions: true,
        },
      },
      groups: {
        include: {
          group: {
            include: {
              permissions: {
                select: {
                  resourceType: true,
                  resourceId: true,
                  actions: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!user) {
    throw new Error('User not found')
  }

  const groupPermissions = user.groups.flatMap((ug) =>
    ug.group.permissions.map((p) => ({
      groupName: ug.group.name,
      resourceType: p.resourceType,
      resourceId: p.resourceId,
      actions: p.actions,
    }))
  )

  return {
    role: user.role,
    directPermissions: user.permissions.map((p) => ({
      resourceType: p.resourceType,
      resourceId: p.resourceId,
      actions: p.actions,
    })),
    groupPermissions,
  }
}

/**
 * Concede permissão a um usuário ou grupo
 */
export async function grantPermission(params: {
  userId?: string
  groupId?: string
  resourceType: ResourceType
  resourceId?: string
  actions: PermissionAction[]
}) {
  if (!params.userId && !params.groupId) {
    throw new Error('Either userId or groupId must be provided')
  }

  return prisma.permission.create({
    data: {
      userId: params.userId,
      groupId: params.groupId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      actions: params.actions,
    },
  })
}

/**
 * Revoga permissão de um usuário ou grupo
 */
export async function revokePermission(permissionId: string) {
  return prisma.permission.delete({
    where: { id: permissionId },
  })
}

export async function getResourceAccess(params: {
  userId: string
  resourceType: ResourceType
  action: PermissionAction
}) {
  const { userId, resourceType, action } = params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { groups: true },
  })

  if (!user || !user.isActive) {
    return { isAdmin: false, hasGlobalAccess: false, resourceIds: [] as string[] }
  }

  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    return { isAdmin: true, hasGlobalAccess: true, resourceIds: [] as string[] }
  }

  const groupIds = user.groups.map((ug) => ug.groupId)

  const permissions = await prisma.permission.findMany({
    where: {
      resourceType,
      actions: { has: action },
      OR: [
        { userId },
        ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
      ],
    },
    select: { resourceId: true },
  })

  const resourceIds = permissions
    .filter((p) => p.resourceId)
    .map((p) => p.resourceId as string)

  const hasGlobalAccess = permissions.some((p) => p.resourceId === null)

  return { isAdmin: false, hasGlobalAccess, resourceIds }
}
