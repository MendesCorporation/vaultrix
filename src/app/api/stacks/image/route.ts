import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { saveUpload } from '@/lib/storage'
import { checkPermission } from '@/lib/auth/permissions'

export const runtime = 'nodejs'

const allowedMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasPermission = await checkPermission({
    userId: session.user.id,
    action: 'CREATE',
    resource: 'STACK',
  })

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo invalido' }, { status: 400 })
  }

  if (!allowedMimeTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Tipo de arquivo não suportado' }, { status: 400 })
  }

  const { url } = await saveUpload({
    file,
    folder: 'stacks',
    prefix: 'stack',
  })

  return NextResponse.json({ url }, { status: 201 })
}
