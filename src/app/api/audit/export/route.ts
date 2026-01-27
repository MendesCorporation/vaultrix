import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const action = searchParams.get('action')
    const resourceType = searchParams.get('resourceType')
    const userId = searchParams.get('userId')

    const where: any = {}

    if (startDate && endDate) {
      where.timestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    if (action) where.action = action
    if (resourceType) where.resourceType = resourceType
    if (userId) where.userId = userId

    const logs = await prisma.auditLog.findMany({
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
    })

    // Gerar CSV
    const headers = ['Timestamp', 'User', 'Email', 'Action', 'Resource Type', 'Resource Name', 'IP Address', 'User Agent']
    const rows = logs.map((log) => [
      new Date(log.timestamp).toISOString(),
      log.user?.name || 'System',
      log.user?.email || '',
      log.action,
      log.resourceType || '',
      log.resourceName || '',
      log.ipAddress,
      log.userAgent || '',
    ])

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error('Failed to export audit logs:', error)
    return NextResponse.json({ error: 'Failed to export audit logs' }, { status: 500 })
  }
}
