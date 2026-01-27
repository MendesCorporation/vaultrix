import { NextResponse } from 'next/server'
import { getSystemConfig } from '@/lib/db/queries/system'

export async function GET() {
  const config = await getSystemConfig(['mfa_required'])
  
  return NextResponse.json({
    mfaRequired: config.mfa_required === true || config.mfa_required === 'true'
  })
}