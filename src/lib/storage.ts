import path from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'

const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage')
const UPLOADS_ROOT = path.join(STORAGE_ROOT, 'uploads')

const mimeToExtension: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
}

export async function saveUpload(params: {
  file: File
  folder: string
  prefix: string
}): Promise<{ url: string; fileName: string }> {
  const { file, folder, prefix } = params
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const originalExt = path.extname(file.name)
  const fallbackExt = mimeToExtension[file.type] || ''
  const ext = originalExt || fallbackExt
  const fileName = `${prefix}-${Date.now()}-${randomUUID()}${ext}`
  const uploadDir = path.join(UPLOADS_ROOT, folder)
  const filePath = path.join(uploadDir, fileName)

  await mkdir(uploadDir, { recursive: true })
  await writeFile(filePath, buffer)

  return { url: `/uploads/${folder}/${fileName}`, fileName }
}

export function getUploadsRoot() {
  return UPLOADS_ROOT
}
