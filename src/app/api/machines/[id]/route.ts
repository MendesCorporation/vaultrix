import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { encryptSystemData, decryptSystemData, isEncrypted } from '@/lib/crypto'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission, getResourceAccess } from '@/lib/auth/permissions'

const updateMachineSchema = z.object({
  hostname: z.string().min(1).max(255).optional(),
  ip: z.string().optional(),
  description: z.string().max(1000).optional(),
  os: z.string().max(100).optional(),
  osVersion: z.string().max(50).optional(),
  specs: z.object({
    cpu: z.string().optional(),
    ram: z.string().optional(),
    storage: z.string().optional(),
  }).optional(),
  providerId: z.string().optional().nullable(),
  username: z.string().max(255).optional(),
  password: z.string().optional(),
  sshKey: z.string().optional(),
  sshPort: z.number().int().min(1).max(65535).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const credentialAccess = await getResourceAccess({
    userId: session.user.id,
    resourceType: 'CREDENTIAL',
    action: 'READ',
  })

  const credentialWhere: any = { isActive: true }
  if (!credentialAccess.isAdmin && !credentialAccess.hasGlobalAccess) {
    credentialWhere.OR = [{ createdById: session.user.id }]
    if (credentialAccess.resourceIds.length > 0) {
      credentialWhere.OR.push({ id: { in: credentialAccess.resourceIds } })
    }
  }

  const machine = await prisma.machine.findUnique({
    where: { id: params.id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      provider: { select: { id: true, name: true } },
      credentials: {
        where: credentialWhere,
        select: { id: true, name: true, username: true, platform: true },
      },
    },
  })

  if (!machine) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const isOwner = machine.createdById === session.user.id

  if (!isAdmin && !isOwner) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'READ',
      resource: 'MACHINE',
      resourceId: params.id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Decrypt SSH username for display
  let decryptedUser = machine.encryptedUser
  if (machine.encryptedUser && isEncrypted(machine.encryptedUser)) {
    try {
      decryptedUser = decryptSystemData(machine.encryptedUser)
    } catch {
      // If decryption fails, keep the original value
    }
  }

  return NextResponse.json({
    ...machine,
    encryptedUser: decryptedUser,
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = updateMachineSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const existingMachine = await prisma.machine.findUnique({
    where: { id: params.id },
  })

  if (!existingMachine) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const isOwner = existingMachine.createdById === session.user.id

  if (!isAdmin && !isOwner) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'UPDATE',
      resource: 'MACHINE',
      resourceId: params.id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { username, password, sshKey, ...machineData } = validation.data

  // Validar se o provider existe (se foi fornecido)
  if (machineData.providerId !== undefined && machineData.providerId !== null) {
    const providerExists = await prisma.machineProvider.findUnique({
      where: { id: machineData.providerId },
    })
    if (!providerExists) {
      return NextResponse.json(
        { error: 'Provider não encontrado' },
        { status: 400 }
      )
    }
  }

  // Encrypt sensitive data before storing
  const encryptedUser = username !== undefined ? (username ? encryptSystemData(username) : null) : undefined
  const encryptedPass = password !== undefined ? (password ? encryptSystemData(password) : null) : undefined
  const encryptedSSHKey = sshKey !== undefined ? (sshKey ? encryptSystemData(sshKey) : null) : undefined

  const machine = await prisma.machine.update({
    where: { id: params.id },
    data: {
      ...machineData,
      ...(encryptedUser !== undefined && { encryptedUser }),
      ...(encryptedPass !== undefined && { encryptedPass }),
      ...(encryptedSSHKey !== undefined && { encryptedSSHKey }),
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'MACHINE',
    resourceId: machine.id,
    resourceName: machine.hostname,
    oldValue: { hostname: existingMachine.hostname, ip: existingMachine.ip },
    newValue: { hostname: machine.hostname, ip: machine.ip },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(machine)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const machine = await prisma.machine.findUnique({
    where: { id: params.id },
  })

  if (!machine) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const isOwner = machine.createdById === session.user.id

  if (!isAdmin && !isOwner) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'DELETE',
      resource: 'MACHINE',
      resourceId: params.id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Soft delete
  await prisma.machine.update({
    where: { id: params.id },
    data: { isActive: false },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    resourceType: 'MACHINE',
    resourceId: machine.id,
    resourceName: machine.hostname,
    oldValue: { hostname: machine.hostname, ip: machine.ip },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
