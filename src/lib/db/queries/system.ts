import { prisma } from '@/lib/db/prisma'

export async function getConfigValue<T = any>(key: string): Promise<T | null> {
  if (!process.env.DATABASE_URL) {
    return null
  }

  const config = await prisma.systemConfig.findUnique({
    where: { key },
    select: { value: true },
  })

  return (config?.value as T) ?? null
}

export async function setConfigValue(key: string, value: any) {
  if (!process.env.DATABASE_URL) {
    return null
  }

  return prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

export async function getSystemConfig(keys: string[]) {
  if (!process.env.DATABASE_URL) {
    return {}
  }

  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  })

  return configs.reduce<Record<string, any>>((acc, item) => {
    acc[item.key] = item.value
    return acc
  }, {})
}
