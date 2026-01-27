import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { getUploadsRoot } from '@/lib/storage'

export const runtime = 'nodejs'

const contentTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const uploadsRoot = getUploadsRoot()
  const legacyRoot = path.join(process.cwd(), 'public', 'uploads')
  const segments = params.path || []
  const requestedPath = path.join(uploadsRoot, ...segments)
  const resolvedPath = path.resolve(requestedPath)
  const resolvedRoot = path.resolve(uploadsRoot)

  if (!resolvedPath.startsWith(resolvedRoot)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const data = await readFile(resolvedPath)
    const ext = path.extname(resolvedPath).toLowerCase()
    const contentType = contentTypes[ext] || 'application/octet-stream'

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    const legacyPath = path.join(legacyRoot, ...segments)
    const resolvedLegacyPath = path.resolve(legacyPath)
    const resolvedLegacyRoot = path.resolve(legacyRoot)

    if (!resolvedLegacyPath.startsWith(resolvedLegacyRoot)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const data = await readFile(resolvedLegacyPath)
      const ext = path.extname(resolvedLegacyPath).toLowerCase()
      const contentType = contentTypes[ext] || 'application/octet-stream'

      return new NextResponse(data, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }
}
