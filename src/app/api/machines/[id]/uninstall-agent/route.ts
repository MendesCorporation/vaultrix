import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { checkPermission } from '@/lib/auth/permissions'
import { createAuditLog } from '@/lib/db/queries/audit'
import { decryptSystemData } from '@/lib/crypto'
import { getClientIP } from '@/lib/security'
import { Client } from 'ssh2'

export const runtime = 'nodejs'

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
    }, 45000)

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  if (!isAdmin) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'UPDATE',
      resource: 'MACHINE',
      resourceId: id,
    })
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const machine = await prisma.machine.findUnique({
    where: { id },
    select: {
      id: true,
      hostname: true,
      ip: true,
      sshPort: true,
      encryptedUser: true,
      encryptedPass: true,
      encryptedSSHKey: true,
      telemetryInstalledAt: true,
    },
  })

  if (!machine) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!machine.ip) {
    return NextResponse.json(
      { error: 'IP da máquina não informado.' },
      { status: 400 }
    )
  }

  const username = machine.encryptedUser ? decryptSystemData(machine.encryptedUser) : ''
  const password = machine.encryptedPass ? decryptSystemData(machine.encryptedPass) : ''
  const privateKey = machine.encryptedSSHKey ? decryptSystemData(machine.encryptedSSHKey) : ''

  if (!username) {
    return NextResponse.json({ error: 'Usuário SSH não informado.' }, { status: 400 })
  }

  if (!privateKey && !password) {
    return NextResponse.json(
      { error: 'Informe senha ou chave SSH para remover o agente.' },
      { status: 400 }
    )
  }

  // Command to uninstall the agent (removes cron job, binary and config)
  const uninstallCommand =
    'if [ -x /usr/local/bin/vaultrix-agent ]; then /usr/local/bin/vaultrix-agent --uninstall || true; fi; rm -f /usr/local/bin/vaultrix-agent /etc/vaultrix-agent/config.json /etc/cron.d/vaultrix-agent'
  const isRoot = username === 'root'
  const needsSudo = !isRoot
  const command = needsSudo
    ? `sudo -S -p '' /bin/sh -c ${shellEscape(uninstallCommand)}`
    : `/bin/sh -c ${shellEscape(uninstallCommand)}`

  try {
    const result = await execSshCommand({
      host: machine.ip,
      port: machine.sshPort || 22,
      username,
      password: privateKey ? undefined : password,
      privateKey: privateKey || undefined,
      command,
      sudoPassword: needsSudo ? password || undefined : undefined,
    })

    // Even if exit code is non-zero, the agent might have been removed
    // Just log and continue

    // Update database to reflect uninstallation
    await prisma.machine.update({
      where: { id: machine.id },
      data: {
        telemetryInstalledAt: null,
        lastTelemetryAt: null,
        telemetryToken: null,
        telemetryEnabled: false,
      },
    })

    // Optionally delete telemetry history
    await prisma.machineTelemetry.deleteMany({
      where: { machineId: machine.id },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      resourceType: 'MACHINE',
      resourceId: machine.id,
      resourceName: machine.hostname,
      metadata: {
        event: 'AGENT_UNINSTALLED',
      },
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao conectar via SSH.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
