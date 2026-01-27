import 'server-only'

import { prisma } from '@/lib/db/prisma'
import { sendAlertEmail } from '@/lib/email/mailer'
import { getDictionary } from '@/lib/i18n'

const OFFLINE_THRESHOLD_MINUTES = 5

export async function checkOfflineMachines() {
  const thresholdTime = new Date(Date.now() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000)

  // Buscar máquinas que estão com telemetria ativa
  const machines = await prisma.machine.findMany({
    where: {
      isActive: true,
      telemetryEnabled: true,
      telemetryInstalledAt: { not: null },
    },
    select: {
      id: true,
      hostname: true,
      ip: true,
      lastTelemetryAt: true,
      createdById: true,
    }
  })

  for (const machine of machines) {
    const isOffline = !machine.lastTelemetryAt || machine.lastTelemetryAt < thresholdTime

    // Verificar se já existe um alerta ativo para esta máquina
    const existingAlertState = await prisma.alertState.findFirst({
      where: {
        machineId: machine.id,
        type: 'MACHINE_OFFLINE',
        isActive: true
      }
    })

    if (isOffline && !existingAlertState) {
      // Buscar alertas configurados por usuários que têm machineOffline = true
      // e que se aplicam a esta máquina (machineId = null para todas ou machineId = machine.id)
      const userAlerts = await prisma.alert.findMany({
        where: {
          machineOffline: true,
          isActive: true,
          OR: [
            { machineId: null }, // Todas as máquinas
            { machineId: machine.id } // Esta máquina específica
          ]
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              locale: true
            }
          }
        }
      })

      // Se não há alertas configurados, não fazer nada
      if (userAlerts.length === 0) {
        continue
      }

      // Criar estado de alerta
      await prisma.alertState.create({
        data: {
          machineId: machine.id,
          type: 'MACHINE_OFFLINE',
          message: `Máquina ${machine.hostname} (${machine.ip}) não responde há mais de ${OFFLINE_THRESHOLD_MINUTES} minutos`,
          isActive: true,
          triggeredAt: new Date()
        }
      })

      // Enviar email para cada usuário que configurou o alerta
      for (const alert of userAlerts) {
        try {
          const dict = await getDictionary((alert.user.locale as 'pt' | 'en') || 'pt')
          const lastTelemetryText = machine.lastTelemetryAt
            ? new Date(machine.lastTelemetryAt).toLocaleString(alert.user.locale === 'en' ? 'en-US' : 'pt-BR')
            : dict.emails.machineOffline.never

          await sendAlertEmail({
            to: alert.user.email,
            name: alert.user.name || alert.user.email,
            alertName: alert.name,
            locale: alert.user.locale,
            title: dict.emails.machineOffline.title,
            description: dict.emails.machineOffline.message
              .replace('{{hostname}}', machine.hostname)
              .replace('{{ip}}', machine.ip || ''),
            machineName: machine.hostname,
            machineIp: machine.ip,
            details: [
              { label: dict.emails.machineOffline.lastTelemetry, value: lastTelemetryText },
              { label: dict.emails.machineOffline.offlineTime, value: dict.emails.machineOffline.offlineTimeValue.replace('{{minutes}}', OFFLINE_THRESHOLD_MINUTES.toString()) }
            ]
          })
        } catch (error) {
          console.error('Erro ao enviar email de alerta:', error)
        }
      }
    } else if (!isOffline && existingAlertState) {
      // Máquina voltou online - resolver alerta
      await prisma.alertState.updateMany({
        where: {
          machineId: machine.id,
          type: 'MACHINE_OFFLINE',
          isActive: true
        },
        data: {
          isActive: false,
          resolvedAt: new Date()
        }
      })

      // Buscar alertas configurados por usuários que têm machineOffline = true
      const userAlerts = await prisma.alert.findMany({
        where: {
          machineOffline: true,
          isActive: true,
          OR: [
            { machineId: null },
            { machineId: machine.id }
          ]
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              locale: true
            }
          }
        }
      })

      // Enviar email de resolução para cada usuário
      for (const alert of userAlerts) {
        try {
          const dict = await getDictionary((alert.user.locale as 'pt' | 'en') || 'pt')
          const lastTelemetryText = machine.lastTelemetryAt
            ? new Date(machine.lastTelemetryAt).toLocaleString(alert.user.locale === 'en' ? 'en-US' : 'pt-BR')
            : dict.emails.machineOnline.now

          await sendAlertEmail({
            to: alert.user.email,
            name: alert.user.name || alert.user.email,
            alertName: alert.name,
            locale: alert.user.locale,
            title: dict.emails.machineOnline.title,
            description: dict.emails.machineOnline.message
              .replace('{{hostname}}', machine.hostname)
              .replace('{{ip}}', machine.ip || ''),
            machineName: machine.hostname,
            machineIp: machine.ip,
            details: [
              { label: dict.emails.machineOnline.lastTelemetry, value: lastTelemetryText }
            ]
          })
        } catch (error) {
          console.error('Erro ao enviar email de resolução:', error)
        }
      }
    }
  }
}
