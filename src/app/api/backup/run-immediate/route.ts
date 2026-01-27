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

async function execSshCommand(params: {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  command: string
  sudoPassword?: string
}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const { host, port, username, password, privateKey, command, sudoPassword } = params

  return new Promise((resolve, reject) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      reject(new Error('SSH timeout'))
    }, 120000)

    conn.on('ready', () => {
      conn.exec(command, { pty: true }, (err, stream) => {
        if (err) {
          clearTimeout(timeout)
          conn.end()
          reject(err)
          return
        }

        let stdout = ''
        let stderr = ''

        stream
          .on('close', (code: number | null) => {
            clearTimeout(timeout)
            conn.end()
            resolve({ code, stdout, stderr })
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString()
          })

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        if (sudoPassword) {
          stream.write(`${sudoPassword}\n`)
        }
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

async function transferFile(params: {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  localPath: string
  remotePath: string
}): Promise<void> {
  const { host, port, username, password, privateKey, localPath, remotePath } = params

  return new Promise((resolve, reject) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      reject(new Error('SFTP timeout'))
    }, 300000)

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          clearTimeout(timeout)
          conn.end()
          reject(err)
          return
        }

        const readStream = fs.createReadStream(localPath)
        const writeStream = sftp.createWriteStream(remotePath)

        writeStream.on('close', () => {
          clearTimeout(timeout)
          conn.end()
          resolve()
        })

        writeStream.on('error', (error: Error) => {
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

const immediateSchema = z.object({
  destination: z.enum(['local', 'remote']),
  machineId: z.string().optional(),
  folder: z.string().min(1),
  retentionDays: z.number().int().min(0),
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
  const validation = immediateSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { destination, machineId, folder, retentionDays } = validation.data

  if (destination === 'remote' && !machineId) {
    return NextResponse.json(
      { error: 'Machine ID is required for remote backups' },
      { status: 400 }
    )
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `vaultrix-backup-${timestamp}.sql`
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
    return NextResponse.json(
      { error: 'Invalid DATABASE_URL format' },
      { status: 500 }
    )
  }

  try {
    const tempDir = '/tmp/vaultrix-backups'
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const localBackupPath = path.join(tempDir, fileName)

    console.log('Running pg_dump via network connection to database...')
    
    const { stdout } = await execAsync(
      `PGPASSWORD="${dbPass}" pg_dump -h "${dbHost}" -p ${dbPort} -U "${dbUser}" -d "${dbName}" -F p`,
      { maxBuffer: 100 * 1024 * 1024 }
    )
    
    fs.writeFileSync(localBackupPath, stdout)

    const stats = fs.statSync(localBackupPath)
    const fileSize = stats.size

    let finalDestination = 'local'
    let finalFolder = folder

    if (destination === 'remote' && machineId) {
      console.log('Starting remote backup to machine:', machineId)
      
      const machine = await prisma.machine.findUnique({
        where: { id: machineId },
      })

      if (!machine || !machine.ip) {
        throw new Error('Remote machine not found or missing IP')
      }

      console.log('Remote machine found:', machine.hostname, machine.ip)

      const username = machine.encryptedUser ? decryptSystemData(machine.encryptedUser) : ''
      const password = machine.encryptedPass ? decryptSystemData(machine.encryptedPass) : ''
      const privateKey = machine.encryptedSSHKey ? decryptSystemData(machine.encryptedSSHKey) : ''

      if (!username) {
        throw new Error('Remote machine missing SSH username')
      }

      console.log('SSH credentials loaded, username:', username)

      const isRoot = username === 'root'
      const mkdirCmd = isRoot
        ? `mkdir -p ${shellEscape(folder)}`
        : `sudo -S -p '' mkdir -p ${shellEscape(folder)} && sudo chown ${username}:${username} ${shellEscape(folder)}`

      console.log('Creating remote directory:', folder)
      await execSshCommand({
        host: machine.ip,
        port: machine.sshPort || 22,
        username,
        password: privateKey ? undefined : password,
        privateKey: privateKey || undefined,
        command: mkdirCmd,
        sudoPassword: !isRoot ? password || undefined : undefined,
      })

      const remotePath = `${folder}/${fileName}`
      console.log('Transferring file to remote:', remotePath)
      
      await transferFile({
        host: machine.ip,
        port: machine.sshPort || 22,
        username,
        password: privateKey ? undefined : password,
        privateKey: privateKey || undefined,
        localPath: localBackupPath,
        remotePath,
      })

      console.log('File transferred successfully')

      if (retentionDays > 0) {
        const cleanupCmd = isRoot
          ? `find ${shellEscape(folder)} -name "vaultrix-backup-*.sql" -type f -mtime +${retentionDays} -delete`
          : `sudo -S -p '' find ${shellEscape(folder)} -name "vaultrix-backup-*.sql" -type f -mtime +${retentionDays} -delete`

        await execSshCommand({
          host: machine.ip,
          port: machine.sshPort || 22,
          username,
          password: privateKey ? undefined : password,
          privateKey: privateKey || undefined,
          command: cleanupCmd,
          sudoPassword: !isRoot ? password || undefined : undefined,
        })
      }

      fs.unlinkSync(localBackupPath)
      console.log('Local temp file removed')

      finalDestination = 'remote'
      finalFolder = folder
    } else {
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true })
      }

      const finalPath = path.join(folder, fileName)
      fs.copyFileSync(localBackupPath, finalPath)
      fs.unlinkSync(localBackupPath)

      if (retentionDays > 0) {
        const files = fs.readdirSync(folder)
          .filter(f => f.startsWith('vaultrix-backup-') && f.endsWith('.sql'))
          .map(f => ({
            name: f,
            path: path.join(folder, f),
            mtime: fs.statSync(path.join(folder, f)).mtime,
          }))
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

        for (const file of files) {
          if (file.mtime < cutoffDate) {
            fs.unlinkSync(file.path)
          }
        }
      }

      finalDestination = 'local'
      finalFolder = folder
    }

    await prisma.backupHistory.create({
      data: {
        fileName,
        fileSize,
        destination: finalDestination,
        machineId: destination === 'remote' ? machineId : null,
        folder: finalFolder,
        status: 'success',
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      resourceType: 'MACHINE',
      resourceName: 'Backup',
      metadata: {
        event: 'BACKUP_CREATED_IMMEDIATE',
        fileName,
        destination: finalDestination,
        fileSize,
      },
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      fileName,
      fileSize,
      destination: finalDestination,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup failed'

    await prisma.backupHistory.create({
      data: {
        fileName,
        destination,
        machineId: destination === 'remote' ? machineId : null,
        folder,
        status: 'error',
        errorMessage: message,
      },
    })

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
