import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getClientIP } from '@/lib/security'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file extension
    if (!file.name.endsWith('.sql')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .sql files are allowed' },
        { status: 400 }
      )
    }

    // Create temp directory
    const tempDir = '/tmp/vaultrix-backups'
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Save uploaded file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `restore-upload-${timestamp}.sql`
    const filePath = path.join(tempDir, fileName)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    fs.writeFileSync(filePath, buffer)

    // Parse database URL
    const databaseUrl = process.env.DATABASE_URL || ''
    let dbUser: string, dbPass: string, dbHost: string, dbPort: string, dbName: string

    try {
      const url = new URL(databaseUrl)
      dbUser = decodeURIComponent(url.username)
      dbPass = decodeURIComponent(url.password)
      dbHost = url.hostname
      dbPort = url.port || '5432'
      dbName = url.pathname.slice(1)

      if (!dbUser || !dbHost || !dbName) {
        throw new Error('Missing required database connection parameters')
      }
    } catch (urlError) {
      fs.unlinkSync(filePath)
      return NextResponse.json(
        { error: 'Invalid DATABASE_URL format' },
        { status: 500 }
      )
    }

    console.log('Dropping database schema...')
    
    // Drop schema
    await execAsync(
      `PGPASSWORD="${dbPass}" psql -h "${dbHost}" -p ${dbPort} -U "${dbUser}" -d "${dbName}" -c "DROP SCHEMA public CASCADE"`,
      { maxBuffer: 100 * 1024 * 1024 }
    )

    console.log('Creating database schema...')
    
    // Create schema
    await execAsync(
      `PGPASSWORD="${dbPass}" psql -h "${dbHost}" -p ${dbPort} -U "${dbUser}" -d "${dbName}" -c "CREATE SCHEMA public"`,
      { maxBuffer: 100 * 1024 * 1024 }
    )

    console.log('Restoring database from uploaded file...')
    
    // Run psql to restore
    await execAsync(
      `PGPASSWORD="${dbPass}" psql -h "${dbHost}" -p ${dbPort} -U "${dbUser}" -d "${dbName}" -f "${filePath}"`,
      { maxBuffer: 100 * 1024 * 1024 }
    )

    // Clean up temp file
    fs.unlinkSync(filePath)

    console.log('Database restored successfully from uploaded file')

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully. Please login again.',
      fileName: file.name,
    })
  } catch (error) {
    console.error('Restore upload error:', error)
    const message = error instanceof Error ? error.message : 'Restore failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
