import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { createAuditLog } from '@/lib/db/queries/audit'
import { decryptSystemData } from '@/lib/crypto'
import { getClientIP } from '@/lib/security'
import { Client } from 'ssh2'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'

export const runtime = 'nodejs'

const execAsync = promisify(exec)

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

async function downloadFile(params: {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  remotePath: string
  localPath: string
}): Promise<void> {
  const { host, port, username, password, privateKey, remotePath, localPath } = params

  return new Promise((resolve, reject) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      reject(new Error('SFTP download timeout'))
    }, 300000)

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          clearTimeout(timeout)
          conn.end()
          reject(err)
          return
        }

        const readStream = sftp.createReadStream(remotePath)
        const writeStream = fs.createWriteStream(localPath)

        writeStream.on('finish', () => {
          clearTimeout(timeout)
          conn.end()
          resolve()
        })

        writeStream.on('error', (error: Error) => {
          clearTimeout(timeout)
          conn.end()
          reject(error)
        })

        readStream.on('error', (error: Error) => {
          clearTimeout(timeout)
          conn.end()
          reject(error)
        })

        readStream.pipe(writeStream)
      })
    })
    .on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    .connect({
      host,
      port,
      username,
      ...(privateKey ? { privateKey } : {}),
      ...(password ? { password } : {}),
      readyTimeout: 20000,
    })
  })
}

const restoreSchema = z.object({
  historyId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = restoreSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { historyId } = validation.data

  // Get backup history entry
  const backup = await prisma.backupHistory.findUnique({
    where: { id: historyId },
  })

  if (!backup) {
    return NextResponse.json({ error: 'Backup not found' }, { status: 404 })
  }

  if (backup.status !== 'success') {
    return NextResponse.json(
      { error: 'Cannot restore from a failed backup' },
      { status: 400 }
    )
  }

  const databaseUrl = process.env.DATABASE_URL || ''

  // Parse database URL
  const dbMatch = databaseUrl.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/)
  if (!dbMatch) {
    return NextResponse.json(
      { error: 'Invalid DATABASE_URL format' },
      { status: 500 }
    )
  }

  const [, dbUser, dbPass, dbHost, dbPort, dbName] = dbMatch

  try {
    // Create temp directory if doesn't exist
    const tempDir = '/tmp/vaultrix-backups'
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const localPath = path.join(tempDir, backup.fileName)
    let backupFilePath = localPath

    if (backup.destination === 'remote' && backup.machineId) {
      // Download from remote machine
      const machine = await prisma.machine.findUnique({
        where: { id: backup.machineId },
      })

      if (!machine || !machine.ip) {
        throw new Error('Remote machine not found or missing IP')
      }

      const username = machine.encryptedUser ? decryptSystemData(machine.encryptedUser) : ''
      const password = machine.encryptedPass ? decryptSystemData(machine.encryptedPass) : ''
      const privateKey = machine.encryptedSSHKey ? decryptSystemData(machine.encryptedSSHKey) : ''

      if (!username) {
        throw new Error('Remote machine missing SSH username')
      }

      const remotePath = `${backup.folder}/${backup.fileName}`

      await downloadFile({
        host: machine.ip,
        port: machine.sshPort || 22,
        username,
        password: privateKey ? undefined : password,
        privateKey: privateKey || undefined,
        remotePath,
        localPath,
      })
    } else {
      // Local backup
      backupFilePath = path.join(backup.folder, backup.fileName)

      if (!fs.existsSync(backupFilePath)) {
        return NextResponse.json(
          { error: 'Backup file not found on disk' },
          { status: 404 }
        )
      }
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

    console.log('Restoring database from backup file...')
    
    // Run psql to restore
    await execAsync(
      `PGPASSWORD="${dbPass}" psql -h "${dbHost}" -p ${dbPort} -U "${dbUser}" -d "${dbName}" -f "${backupFilePath}"`,
      { maxBuffer: 100 * 1024 * 1024 }
    )

    // Clean up temp file if downloaded from remote
    if (backup.destination === 'remote' && fs.existsSync(localPath)) {
      fs.unlinkSync(localPath)
    }

    console.log('Database restored successfully')

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully. Please login again.',
      fileName: backup.fileName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Restore failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
