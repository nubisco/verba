import { prisma } from '../prisma.js'
import type { CreateProjectInput, UpdateProjectInput } from '../schemas/project.schema.js'
import { encrypt } from './encryption.service.js'
import { isOperator } from './operator.service.js'

function notFound(): never {
  throw Object.assign(new Error('Project not found'), { statusCode: 404 })
}

/** The projects this person is a member of. Operators included: see acl.service. */
export async function listProjects(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { projectId: true },
  })
  const projectIds = memberships.map((m) => m.projectId)
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    orderBy: { createdAt: 'desc' },
  })
  return projects.map(maskAiKey)
}

/** Never send the stored key, encrypted or not, to a client: only whether there is one. */
function maskAiKey<T extends { aiApiKey: string | null }>(project: T): T {
  return { ...project, aiApiKey: project.aiApiKey ? '***' : null }
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) notFound()
  return maskAiKey(project)
}

// Project cap per platform plan. Platform owns the plan name; Verba owns the
// mapping to a concrete project limit. Unknown plans fall back to 'free'.
// TRIAL_PROJECT_CAP env var overrides the 'free' tier (emergency lever).
const PLAN_PROJECT_CAP: Record<string, number> = {
  free: Number(process.env.TRIAL_PROJECT_CAP ?? 3),
  starter: 10,
  pro: Number.POSITIVE_INFINITY,
  enterprise: Number.POSITIVE_INFINITY,
}

function getProjectCapForPlan(plan: string | undefined): number {
  return PLAN_PROJECT_CAP[plan ?? 'free'] ?? PLAN_PROJECT_CAP.free
}

async function resolveUniqueSlug(base: string): Promise<string> {
  let candidate = base
  for (let i = 2; i < 1000; i++) {
    const taken = await prisma.project.findUnique({ where: { slug: candidate } })
    if (!taken) return candidate
    candidate = `${base}-${i}`
  }
  throw Object.assign(new Error('Could not allocate a unique slug'), { statusCode: 409 })
}

export async function createProject(userId: string, plan: string | undefined, data: CreateProjectInput) {
  if (!(await isOperator(userId))) {
    const cap = getProjectCapForPlan(plan)
    if (Number.isFinite(cap)) {
      const ownedAdminCount = await prisma.membership.count({
        where: { userId, role: 'ADMIN' },
      })
      if (ownedAdminCount >= cap) {
        throw Object.assign(
          new Error(`Project limit reached for plan "${plan ?? 'free'}" (${cap}). Upgrade your plan to add more.`),
          { statusCode: 402 },
        )
      }
    }
  }
  const slug = await resolveUniqueSlug(data.slug)
  return maskAiKey(await prisma.project.create({ data: { ...data, slug } }))
}

export async function updateProject(id: string, data: UpdateProjectInput) {
  await getProject(id)
  if (data.slug) {
    const existing = await prisma.project.findFirst({
      where: { slug: data.slug, NOT: { id } },
    })
    if (existing) throw Object.assign(new Error('Slug already taken'), { statusCode: 409 })
  }
  // Encrypt AI API key before persisting; skip if unchanged (masked placeholder).
  // Whatever the client sends is encrypted, including something shaped like
  // ciphertext: storing it as-is would let a client plant a value.
  const payload: typeof data = { ...data }
  if (payload.aiApiKey === '***' || payload.aiApiKey === '') {
    delete payload.aiApiKey // don't overwrite the stored key
  } else if (payload.aiApiKey) {
    payload.aiApiKey = encrypt(payload.aiApiKey)
  }
  return maskAiKey(await prisma.project.update({ where: { id }, data: payload }))
}

export async function deleteProject(id: string) {
  await getProject(id)
  await prisma.project.delete({ where: { id } })
}
