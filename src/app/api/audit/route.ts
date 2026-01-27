import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getAuditLogs } from '@/lib/db/queries/audit'
import type { AuditAction, ResourceType } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only admins can view audit logs
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const action = searchParams.get('action') as AuditAction | null
  const resourceType = searchParams.get('resourceType') as ResourceType | null
  const userId = searchParams.get('userId')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const result = await getAuditLogs({
    page,
    limit,
    ...(action && { action }),
    ...(resourceType && { resourceType }),
    ...(userId && { userId }),
    ...(startDate && { startDate: new Date(startDate) }),
    ...(endDate && { endDate: new Date(endDate) }),
  })

  return NextResponse.json(result)
}
