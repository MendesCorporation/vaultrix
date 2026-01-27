import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { checkPermission } from '@/lib/auth/permissions'
import { createAuditLog } from '@/lib/db/queries/audit'
import { decryptSystemData } from '@/lib/crypto'
import { getClientIP } from '@/lib/security'
import { Client } from 'ssh2'
import { z } from 'zod'

export const runtime = 'nodejs'

const deploySchema = z.object({
  machineId: z.string().min(1),
  folderName: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/, 'Nome da pasta inválido'),
  env: z.string().max(10000).optional().or(z.literal('')),
  dockerCompose: z.string().min(1).max(20000),
})

interface DeployStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  message?: string
  output?: string
}

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
    }, 120000) // 2 minutos para deploy (pode demorar para baixar imagens)

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

async function updateDeploymentSteps(deploymentId: string, steps: DeployStep[]) {
  await prisma.stackDeployment.update({
    where: { id: deploymentId },
    data: {
      logs: JSON.stringify(steps),
      updatedAt: new Date()
    }
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

  const { id: stackId } = await params

  // Verificar permissão na stack
  const hasStackPermission = await checkPermission({
    userId: session.user.id,
    action: 'UPDATE',
    resource: 'STACK',
    resourceId: stackId,
  })

  if (!hasStackPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = deploySchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { machineId, folderName, env, dockerCompose } = validation.data

  // Verificar permissão na máquina
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  if (!isAdmin) {
    const hasMachinePermission = await checkPermission({
      userId: session.user.id,
      action: 'UPDATE',
      resource: 'MACHINE',
      resourceId: machineId,
    })
    if (!hasMachinePermission) {
      return NextResponse.json({ error: 'Sem permissão na máquina' }, { status: 403 })
    }
  }

  // Buscar stack
  const stack = await prisma.stack.findUnique({
    where: { id: stackId },
  })

  if (!stack) {
    return NextResponse.json({ error: 'Stack não encontrada' }, { status: 404 })
  }

  if (stack.mode !== 'automatic') {
    return NextResponse.json({ error: 'Stack não está em modo automático' }, { status: 400 })
  }

  // Buscar máquina
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: {
      id: true,
      hostname: true,
      ip: true,
      sshPort: true,
      encryptedUser: true,
      encryptedPass: true,
      encryptedSSHKey: true,
    },
  })

  if (!machine) {
    return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 })
  }

  if (!machine.ip) {
    return NextResponse.json({ error: 'IP da máquina não informado' }, { status: 400 })
  }

  const username = machine.encryptedUser ? decryptSystemData(machine.encryptedUser) : ''
  const password = machine.encryptedPass ? decryptSystemData(machine.encryptedPass) : ''
  const privateKey = machine.encryptedSSHKey ? decryptSystemData(machine.encryptedSSHKey) : ''

  if (!username) {
    return NextResponse.json({ error: 'Usuário SSH não informado' }, { status: 400 })
  }

  if (!privateKey && !password) {
    return NextResponse.json({ error: 'Informe senha ou chave SSH' }, { status: 400 })
  }

  // Criar registro de deployment
  const deployment = await prisma.stackDeployment.create({
    data: {
      stackId,
      machineId,
      folderName,
      status: 'deploying',
    },
  })

  // Definir etapas do deploy
  const steps: DeployStep[] = [
    { id: 'create-folder', name: 'Criar pasta de deploy', status: 'pending' },
    { id: 'create-env', name: 'Criar arquivo .env', status: 'pending' },
    { id: 'create-compose', name: 'Criar docker-compose.yml', status: 'pending' },
    { id: 'pull-images', name: 'Baixar imagens Docker', status: 'pending' },
    { id: 'start-containers', name: 'Iniciar containers', status: 'pending' },
  ]

  // Salvar etapas iniciais
  await updateDeploymentSteps(deployment.id, steps)

  const isRoot = username === 'root'
  const needsSudo = !isRoot

  try {
    // Etapa 1: Criar pasta
    steps[0].status = 'running'
    await updateDeploymentSteps(deployment.id, steps)
    
    const mkdirCmd = `mkdir -p ~/${folderName}`
    const mkdirResult = await execSshCommand({
      host: machine.ip,
      port: machine.sshPort || 22,
      username,
      password: privateKey ? undefined : password,
      privateKey: privateKey || undefined,
      command: mkdirCmd,
    })

    if (mkdirResult.code !== 0) {
      steps[0].status = 'error'
      steps[0].message = `Falha ao criar pasta: ${mkdirResult.stderr || mkdirResult.stdout}`
      await updateDeploymentSteps(deployment.id, steps)
      throw new Error(steps[0].message)
    }
    
    steps[0].status = 'completed'
    steps[0].message = 'Pasta criada com sucesso'
    await updateDeploymentSteps(deployment.id, steps)

    // Etapa 2: Criar .env (se tiver)
    steps[1].status = 'running'
    await updateDeploymentSteps(deployment.id, steps)
    
    const envContent = env || stack.env
    if (envContent) {
      const envCmd = `cat > ~/${folderName}/.env << 'INVETRIX_EOF'\n${envContent}\nINVETRIX_EOF`
      const envResult = await execSshCommand({
        host: machine.ip,
        port: machine.sshPort || 22,
        username,
        password: privateKey ? undefined : password,
        privateKey: privateKey || undefined,
        command: envCmd,
      })

      if (envResult.code !== 0) {
        steps[1].status = 'error'
        steps[1].message = `Falha ao criar .env: ${envResult.stderr || envResult.stdout}`
        await updateDeploymentSteps(deployment.id, steps)
        throw new Error(steps[1].message)
      }
      steps[1].message = 'Arquivo .env criado com sucesso'
    } else {
      steps[1].message = 'Nenhum arquivo .env necessário'
    }
    
    steps[1].status = 'completed'
    await updateDeploymentSteps(deployment.id, steps)

    // Etapa 3: Criar docker-compose.yml
    steps[2].status = 'running'
    await updateDeploymentSteps(deployment.id, steps)
    
    const composeContent = dockerCompose || stack.dockerCompose || ''
    const composeCmd = `cat > ~/${folderName}/docker-compose.yml << 'INVETRIX_EOF'\n${composeContent}\nINVETRIX_EOF`
    const composeResult = await execSshCommand({
      host: machine.ip,
      port: machine.sshPort || 22,
      username,
      password: privateKey ? undefined : password,
      privateKey: privateKey || undefined,
      command: composeCmd,
    })

    if (composeResult.code !== 0) {
      steps[2].status = 'error'
      steps[2].message = `Falha ao criar docker-compose.yml: ${composeResult.stderr || composeResult.stdout}`
      await updateDeploymentSteps(deployment.id, steps)
      throw new Error(steps[2].message)
    }
    
    steps[2].status = 'completed'
    steps[2].message = 'Arquivo docker-compose.yml criado com sucesso'
    await updateDeploymentSteps(deployment.id, steps)

    // Etapa 4: Docker compose pull
    steps[3].status = 'running'
    await updateDeploymentSteps(deployment.id, steps)
    
    const pullCmd = needsSudo
      ? `cd ~/${folderName} && sudo -S -p '' docker compose pull`
      : `cd ~/${folderName} && docker compose pull`
    const pullResult = await execSshCommand({
      host: machine.ip,
      port: machine.sshPort || 22,
      username,
      password: privateKey ? undefined : password,
      privateKey: privateKey || undefined,
      command: pullCmd,
      sudoPassword: needsSudo ? password || undefined : undefined,
    })

    if (pullResult.code !== 0) {
      steps[3].status = 'error'
      steps[3].message = `Falha ao baixar imagens: ${pullResult.stderr || pullResult.stdout}`
      await updateDeploymentSteps(deployment.id, steps)
      throw new Error(steps[3].message)
    }
    
    steps[3].status = 'completed'
    steps[3].message = 'Imagens baixadas com sucesso'
    steps[3].output = pullResult.stdout
    await updateDeploymentSteps(deployment.id, steps)

    // Etapa 5: Docker compose up -d
    steps[4].status = 'running'
    await updateDeploymentSteps(deployment.id, steps)
    
    const upCmd = needsSudo
      ? `cd ~/${folderName} && sudo -S -p '' docker compose up -d`
      : `cd ~/${folderName} && docker compose up -d`
    const upResult = await execSshCommand({
      host: machine.ip,
      port: machine.sshPort || 22,
      username,
      password: privateKey ? undefined : password,
      privateKey: privateKey || undefined,
      command: upCmd,
      sudoPassword: needsSudo ? password || undefined : undefined,
    })

    if (upResult.code !== 0) {
      steps[4].status = 'error'
      steps[4].message = `Falha ao iniciar containers: ${upResult.stderr || upResult.stdout}`
      await updateDeploymentSteps(deployment.id, steps)
      throw new Error(steps[4].message)
    }
    
    steps[4].status = 'completed'
    steps[4].message = 'Containers iniciados com sucesso'
    steps[4].output = upResult.stdout
    await updateDeploymentSteps(deployment.id, steps)

    // Atualizar deployment como sucesso
    await prisma.stackDeployment.update({
      where: { id: deployment.id },
      data: {
        status: 'success',
        deployedAt: new Date(),
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      resourceType: 'STACK',
      resourceId: stackId,
      resourceName: `${stack.name} -> ${machine.hostname}`,
      metadata: {
        event: 'STACK_DEPLOYED',
        folderName,
        machineId,
        deploymentId: deployment.id,
      },
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      deploymentId: deployment.id,
      steps,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao fazer deploy'

    await prisma.stackDeployment.update({
      where: { id: deployment.id },
      data: {
        status: 'error',
        errorMessage: message,
      },
    })

    return NextResponse.json(
      { error: message, steps },
      { status: 500 }
    )
  }
}
