import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getConfigValue } from '@/lib/db/queries/system'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const publicBaseUrl = await getConfigValue<string>('public_base_url')

  return NextResponse.json({
    publicBaseUrl: publicBaseUrl || '',
  })
}
