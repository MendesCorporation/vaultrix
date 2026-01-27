import { NextRequest, NextResponse } from 'next/server'
import { runScheduledBackups } from '@/lib/backup/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Endpoint que executa o scheduler de backups
// Este endpoint deve ser chamado a cada minuto pelo script interno
export async function GET(request: NextRequest) {
  // Permite apenas chamadas internas (localhost)
  const host = request.headers.get('host')
  if (!host?.includes('localhost') && !host?.includes('127.0.0.1')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runScheduledBackups()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error running backup scheduler:', error)
    return NextResponse.json(
      { error: 'Failed to run backup scheduler' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
