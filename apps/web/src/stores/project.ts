import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiFetch } from '../api'
import { useAuthStore } from './auth'

export interface ProjectData {
  id: string
  name: string
  slug: string
  avatar?: string | null
  aiEnabled?: boolean
  aiProvider?: string | null
  aiApiKey?: string | null
  aiModel?: string | null
}

export interface Locale {
  id: string
  code: string
  name: string
  isEnabled: boolean
}

export interface LocaleProgress {
  id: string
  code: string
  name: string
  approved: number
  total: number
}

export interface Namespace {
  id: string
  name: string
  slug: string
  _count?: { keys: number }
}

export interface Member {
  userId: string
  role: string
  assignedLocales?: string[]
  user: { email: string }
}

export interface Task {
  id: string
  status: string
  key: { id: string; name: string; project: { id: string; name: string } }
  locale: { code: string }
}

interface Translation {
  id: string
  localeId: string
  status: string
}

export const useProjectStore = defineStore('project', () => {
  const auth = useAuthStore()

  const projectId = ref<string | null>(null)
  const project = ref<ProjectData | null>(null)
  const loading = ref(false)
  const locales = ref<Locale[]>([])
  const namespaces = ref<Namespace[]>([])
  const members = ref<Member[]>([])
  const localeProgress = ref<LocaleProgress[]>([])
  const tasks = ref<Task[]>([])
  const totalKeys = ref(0)
  const needsReview = ref(0)

  const isMaintainer = computed(() => {
    const m = members.value.find((m) => m.userId === auth.user?.id)
    return m ? ['MAINTAINER', 'ADMIN'].includes(m.role) : (auth.user?.isGlobalAdmin ?? false)
  })

  const isAdmin = computed(() => {
    const m = members.value.find((m) => m.userId === auth.user?.id)
    return m ? m.role === 'ADMIN' : (auth.user?.isGlobalAdmin ?? false)
  })

  async function load(id: string) {
    projectId.value = id
    loading.value = true
    try {
      const [proj, keys, locs, translations, submitted, nsList, memberList, taskList] = await Promise.all([
        apiFetch<ProjectData>(`/projects/${id}`),
        apiFetch<{ items: unknown[]; total: number }>(`/projects/${id}/keys?limit=1`),
        apiFetch<Locale[]>(`/projects/${id}/locales`),
        apiFetch<Translation[]>(`/projects/${id}/translations?limit=100`),
        apiFetch<unknown[]>(`/projects/${id}/translations?status=SUBMITTED&limit=100`),
        apiFetch<Namespace[]>(`/projects/${id}/namespaces`),
        apiFetch<Member[]>(`/projects/${id}/members`),
        apiFetch<Task[]>('/auth/me/tasks').catch(() => []),
      ])
      project.value = proj
      locales.value = locs
      namespaces.value = nsList
      members.value = memberList
      totalKeys.value = keys.total
      needsReview.value = submitted.length
      tasks.value = (taskList as Task[]).filter((t) => t.key.project.id === id)
      localeProgress.value = locs.map((locale) => {
        const lt = (translations as Translation[]).filter((tx) => tx.localeId === locale.id)
        return {
          id: locale.id,
          code: locale.code,
          name: locale.name,
          approved: lt.filter((tx) => tx.status === 'APPROVED').length,
          total: keys.total,
        }
      })
    } finally {
      loading.value = false
    }
  }

  async function reloadMembers() {
    if (!projectId.value) return
    members.value = await apiFetch<Member[]>(`/projects/${projectId.value}/members`)
  }

  /**
   * Lightweight fetch: only project name/avatar. Used by DefaultLayout to populate
   * the sidebar avatar and breadcrumbs on non-tab project views (board, keys, review).
   * No-ops if the project is already loaded (ProjectDetailView may have done the full load).
   */
  async function loadName(id: string) {
    if (projectId.value === id && project.value) return
    projectId.value = id
    project.value = await apiFetch<ProjectData>(`/projects/${id}`)
  }

  return {
    projectId,
    project,
    loading,
    locales,
    namespaces,
    members,
    localeProgress,
    tasks,
    totalKeys,
    needsReview,
    isMaintainer,
    isAdmin,
    load,
    loadName,
    reloadMembers,
  }
})
