import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { hashPassword, verifyPassword } from '@/lib/crypto'
import { createAuditLog } from '@/lib/db/queries/audit'
import { normalizeEmail } from '@/lib/utils/email'

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  currentPassword: z.string().min(8).optional(),
  locale: z.enum(['pt', 'en']).optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  isActive: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Users can only view their own profile, admins can view all
  if (
    session.user.id !== params.id &&
    session.user.role !== 'ADMIN' &&
    session.user.role !== 'SUPER_ADMIN'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      locale: true,
      lastLoginAt: true,
      createdAt: true,
      groups: {
        include: { group: true },
      },
      permissions: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(user)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only admins can update users (except their own profile)
  const isOwnProfile = session.user.id === params.id
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'

  if (!isOwnProfile && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = updateUserSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: params.id },
  })

  if (!existingUser) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Cannot modify SUPER_ADMIN unless you are SUPER_ADMIN
  if (existingUser.role === 'SUPER_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot modify super admin' }, { status: 403 })
  }

  // Non-admins can only update their own name and password
  if (!isAdmin && (validation.data.role || validation.data.email || validation.data.isActive !== undefined)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check if new email conflicts
  const normalizedEmail = validation.data.email
    ? normalizeEmail(validation.data.email)
    : undefined
  const existingEmailNormalized = normalizeEmail(existingUser.email)

  if (normalizedEmail && normalizedEmail !== existingEmailNormalized) {
    const emailConflict = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })
    if (emailConflict) {
      return NextResponse.json(
        { error: 'Email already in use' },
        { status: 409 }
      )
    }
  }

  const updateData: any = { ...validation.data }
  delete updateData.password
  delete updateData.currentPassword

  if (normalizedEmail) {
    updateData.email = normalizedEmail
  }
  // Hash new password if provided
  if (validation.data.password) {
    if (isOwnProfile) {
      if (!validation.data.currentPassword) {
        return NextResponse.json({ error: 'Senha atual obrigatória' }, { status: 400 })
      }
      const isValid = await verifyPassword(validation.data.currentPassword, existingUser.passwordHash)
      if (!isValid) {
        return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 })
      }
    }
    updateData.passwordHash = await hashPassword(validation.data.password)
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'USER',
    resourceId: user.id,
    resourceName: user.name,
    oldValue: { email: existingUser.email, role: existingUser.role },
    newValue: { email: user.email, role: user.role },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  if (validation.data.password) {
    await createAuditLog({
      userId: session.user.id,
      action: 'PASSWORD_CHANGE',
      resourceType: 'USER',
      resourceId: user.id,
      resourceName: user.name,
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || undefined,
    })
  }

  return NextResponse.json(user)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only admins can delete users
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Cannot delete yourself
  if (session.user.id === params.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
  })

  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Cannot delete SUPER_ADMIN
  if (user.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot delete super admin' }, { status: 403 })
  }

  await prisma.$transaction([
    prisma.auditLog.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    }),
    prisma.machine.updateMany({
      where: { createdById: user.id },
      data: { createdById: session.user.id },
    }),
    prisma.credential.updateMany({
      where: { createdById: user.id },
      data: { createdById: session.user.id },
    }),
    prisma.user.delete({
      where: { id: user.id },
    }),
  ])

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    resourceType: 'USER',
    resourceId: user.id,
    resourceName: user.name,
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
