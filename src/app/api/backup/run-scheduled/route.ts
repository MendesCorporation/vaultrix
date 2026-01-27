import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decryptSystemData } from '@/lib/crypto'
import { Client } from 'ssh2'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

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

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const configId = searchParams.get('configId')

  if (!configId) {
    return NextResponse.json({ error: 'Config ID required' }, { status: 400 })
  }

  const config = await prisma.backupConfig.findUnique({
    where: { id: configId },
    include: { machine: true },
  })

  if (!config || !config.isActive) {
    return NextResponse.json({ error: 'Config not found or inactive' }, { status: 404 })
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
    await prisma.backupConfig.update({
      where: { id: configId },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: 'error',
        lastRunMessage: 'Invalid DATABASE_URL format',
      },
    })
    return NextResponse.json({ error: 'Invalid DATABASE_URL format' }, { status: 500 })
  }

  try {
    const tempDir = '/tmp/vaultrix-backups'
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const localBackupPath = path.join(tempDir, fileName)

    console.log(`[${config.name}] Running pg_dump...`)
    
    const { stdout } = await execAsync(
      `PGPASSWORD="${dbPass}" pg_dump -h "${dbHost}" -p ${dbPort} -U "${dbUser}" -d "${dbName}" -F p`,
      { maxBuffer: 100 * 1024 * 1024 }
    )
    
    fs.writeFileSync(localBackupPath, stdout)

    const stats = fs.statSync(localBackupPath)
    const fileSize = stats.size

    let finalDestination = 'local'
    let finalFolder = config.folder

    if (config.destination === 'remote' && config.machineId && config.machine) {
      console.log(`[${config.name}] Transferring to remote machine...`)
      
      const machine = config.machine

      if (!machine.ip) {
        throw new Error('Remote machine missing IP')
      }

      const username = machine.encryptedUser ? decryptSystemData(machine.encryptedUser) : ''
      const password = machine.encryptedPass ? decryptSystemData(machine.encryptedPass) : ''
      const privateKey = machine.encryptedSSHKey ? decryptSystemData(machine.encryptedSSHKey) : ''

      if (!username) {
        throw new Error('Remote machine missing SSH username')
      }

      const isRoot = username === 'root'
      const mkdirCmd = isRoot
        ? `mkdir -p ${shellEscape(config.folder)}`
        : `sudo -S -p '' mkdir -p ${shellEscape(config.folder)} && sudo chown ${username}:${username} ${shellEscape(config.folder)}`

      await execSshCommand({
        host: machine.ip,
        port: machine.sshPort || 22,
        username,
        password: privateKey ? undefined : password,
        privateKey: privateKey || undefined,
        command: mkdirCmd,
        sudoPassword: !isRoot ? password || undefined : undefined,
      })

      const remotePath = `${config.folder}/${fileName}`
      
      await transferFile({
        host: machine.ip,
        port: machine.sshPort || 22,
        username,
        password: privateKey ? undefined : password,
        privateKey: privateKey || undefined,
        localPath: localBackupPath,
        remotePath,
      })

      if (config.retentionDays > 0) {
        const cleanupCmd = isRoot
          ? `find ${shellEscape(config.folder)} -name "vaultrix-backup-*.sql" -type f -mtime +${config.retentionDays} -delete`
          : `sudo -S -p '' find ${shellEscape(config.folder)} -name "vaultrix-backup-*.sql" -type f -mtime +${config.retentionDays} -delete`

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

      finalDestination = 'remote'
      finalFolder = config.folder
    } else {
      if (!fs.existsSync(config.folder)) {
        fs.mkdirSync(config.folder, { recursive: true })
      }

      const finalPath = path.join(config.folder, fileName)
      fs.copyFileSync(localBackupPath, finalPath)
      fs.unlinkSync(localBackupPath)

      if (config.retentionDays > 0) {
        const files = fs.readdirSync(config.folder)
          .filter(f => f.startsWith('vaultrix-backup-') && f.endsWith('.sql'))
          .map(f => ({
            name: f,
            path: path.join(config.folder, f),
            mtime: fs.statSync(path.join(config.folder, f)).mtime,
          }))
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays)

        for (const file of files) {
          if (file.mtime < cutoffDate) {
            fs.unlinkSync(file.path)
          }
        }
      }

      finalDestination = 'local'
      finalFolder = config.folder
    }

    await prisma.backupHistory.create({
      data: {
        fileName,
        fileSize,
        destination: finalDestination,
        machineId: config.destination === 'remote' ? config.machineId : null,
        folder: finalFolder,
        status: 'success',
      },
    })

    await prisma.backupConfig.update({
      where: { id: configId },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: 'success',
        lastRunMessage: `Backup created: ${fileName}`,
      },
    })

    console.log(`[${config.name}] Backup completed successfully`)

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
        destination: config.destination,
        machineId: config.destination === 'remote' ? config.machineId : null,
        folder: config.folder,
        status: 'error',
        errorMessage: message,
      },
    })

    await prisma.backupConfig.update({
      where: { id: configId },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: 'error',
        lastRunMessage: message,
      },
    })

    console.error(`[${config.name}] Backup failed:`, message)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
