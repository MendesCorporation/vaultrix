import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { checkPermission } from '@/lib/auth/permissions'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getConfigValue } from '@/lib/db/queries/system'
import { decryptSystemData } from '@/lib/crypto'
import { generateSecureToken, hashToken } from '@/lib/security'
import { getClientIP } from '@/lib/security'
import { Client } from 'ssh2'

export const runtime = 'nodejs'

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function resolveBaseUrl(configValue: string | null, origin: string) {
  const trimmed = (configValue || '').trim()
  if (!trimmed) return origin
  return trimmed.replace(/\/+$/, '')
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
  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'

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
      telemetryIntervalMin: true,
      lastTelemetryAt: true,
    },
  })

  if (!machine) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (machine.lastTelemetryAt && !force) {
    return NextResponse.json(
      { error: 'Máquina já está enviando dados. Use force=true para reinstalar.' },
      { status: 409 }
    )
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
      { error: 'Informe senha ou chave SSH para instalar o agente.' },
      { status: 400 }
    )
  }

  const origin = new URL(request.url).origin
  const publicBaseUrl = await getConfigValue<string>('public_base_url')
  const baseUrl = resolveBaseUrl(publicBaseUrl, origin)
  const apiUrl = `${baseUrl}/api/telemetry`
  const downloadUrl = `${baseUrl}/agent/vaultrix-agent-linux-amd64`
  const interval = machine.telemetryIntervalMin || 1

  const token = generateSecureToken(32)
  const tokenHash = hashToken(token)

  await prisma.machine.update({
    where: { id: machine.id },
    data: { telemetryToken: tokenHash, telemetryEnabled: true },
  })

  const baseCommand = `curl -sSL ${downloadUrl} -o /tmp/vaultrix-agent && chmod +x /tmp/vaultrix-agent && /tmp/vaultrix-agent --install --token=${token} --api-url=${apiUrl} --interval=${interval}`
  const isRoot = username === 'root'
  const needsSudo = !isRoot
  const command = needsSudo
    ? `sudo -S -p '' /bin/sh -c ${shellEscape(baseCommand)}`
    : `/bin/sh -c ${shellEscape(baseCommand)}`

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

    if (result.code !== 0) {
      return NextResponse.json(
        { error: `Falha ao instalar agente: ${result.stderr || result.stdout}` },
        { status: 500 }
      )
    }

    await prisma.machine.update({
      where: { id: machine.id },
      data: { telemetryInstalledAt: new Date() },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      resourceType: 'MACHINE',
      resourceId: machine.id,
      resourceName: machine.hostname,
      metadata: {
        event: 'AGENT_INSTALLED',
        interval,
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
