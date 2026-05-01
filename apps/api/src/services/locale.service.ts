import { prisma } from '../prisma.js'
import type { CreateLocaleInput, UpdateLocaleInput } from '../schemas/locale.schema.js'

function notFound(): never {
  throw Object.assign(new Error('Locale not found'), { statusCode: 404 })
}

export async function listLocales(projectId: string) {
  return prisma.locale.findMany({
    where: { projectId },
    orderBy: { code: 'asc' },
  })
}

export async function getLocale(projectId: string, id: string) {
  const locale = await prisma.locale.findFirst({ where: { id, projectId } })
  if (!locale) notFound()
  return locale
}

export async function createLocale(projectId: string, data: CreateLocaleInput) {
  const existing = await prisma.locale.findUnique({
    where: { projectId_code: { projectId, code: data.code } },
  })
  if (existing)
    throw Object.assign(new Error('Locale code already exists in this project'), {
      statusCode: 409,
    })
  return prisma.locale.create({ data: { ...data, projectId } })
}

export async function updateLocale(projectId: string, id: string, data: UpdateLocaleInput) {
  await getLocale(projectId, id)
  if (data.code) {
    const existing = await prisma.locale.findFirst({
      where: { projectId, code: data.code, NOT: { id } },
    })
    if (existing)
      throw Object.assign(new Error('Locale code already exists in this project'), {
        statusCode: 409,
      })
  }
  return prisma.locale.update({ where: { id }, data })
}

export async function deleteLocale(projectId: string, id: string) {
  await getLocale(projectId, id)
  const count = await prisma.translation.count({ where: { localeId: id } })
  if (count > 0)
    throw Object.assign(new Error('Cannot delete locale with existing translations'), {
      statusCode: 409,
    })
  await prisma.locale.delete({ where: { id } })
}
