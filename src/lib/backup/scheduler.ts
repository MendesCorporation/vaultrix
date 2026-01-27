import 'server-only'

import { prisma } from '@/lib/db/prisma'

export async function runScheduledBackups() {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentDay = now.getDay() // 0 = Sunday, 1 = Monday, etc.

  // Buscar configurações ativas
  const allConfigs = await prisma.backupConfig.findMany({
    where: {
      isActive: true,
    },
  })

  // Filtrar apenas as que têm scheduleTime
  const configs = allConfigs.filter(c => c.scheduleTime !== null)

  for (const config of configs) {
    if (!config.scheduleTime) continue

    const [scheduleHour, scheduleMinute] = config.scheduleTime.split(':').map(Number)

    // Verificar se é o horário correto
    if (scheduleHour !== currentHour || scheduleMinute !== currentMinute) {
      continue
    }

    // Verificar se é o dia correto (se scheduleDays não estiver vazio)
    if (config.scheduleDays.length > 0) {
      const dayMap: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      }

      const allowedDays = config.scheduleDays.map(d => dayMap[d.toLowerCase()])
      if (!allowedDays.includes(currentDay)) {
        continue
      }
    }

    // Verificar se já rodou neste minuto (evitar duplicação)
    if (config.lastRunAt) {
      const lastRunMinute = config.lastRunAt.getMinutes()
      const lastRunHour = config.lastRunAt.getHours()
      const lastRunDay = config.lastRunAt.getDate()
      const currentDayOfMonth = now.getDate()

      if (
        lastRunHour === currentHour &&
        lastRunMinute === currentMinute &&
        lastRunDay === currentDayOfMonth
      ) {
        // Já rodou neste minuto hoje
        continue
      }
    }

    // Executar backup
    try {
      console.log(`[Scheduler] Running backup: ${config.name}`)
      
      // Chamar o endpoint de backup
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const response = await fetch(`${baseUrl}/api/backup/run-scheduled?configId=${config.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.text()
        console.error(`[Scheduler] Backup failed for ${config.name}:`, error)
      } else {
        console.log(`[Scheduler] Backup completed successfully: ${config.name}`)
      }
    } catch (error) {
      console.error(`[Scheduler] Error running backup ${config.name}:`, error)
    }
  }
}
