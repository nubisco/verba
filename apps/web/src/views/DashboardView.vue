<template>
  <!-- Topbar -->
  <Teleport defer to="#verba-topbar">
    <NbButton variant="primary" size="sm" @click="showForm = !showForm">
      {{ showForm ? t('common.cancel') : t('projects.create.newProject') }}
    </NbButton>
  </Teleport>

  <div class="home-view">
    <div class="welcome">
      <h2>
        {{
          t('dashboard.welcome', {
            name: auth.user?.name?.trim() || auth.user?.email,
          })
        }}
      </h2>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>

    <template v-else>
      <!-- My Projects -->
      <section class="section">
        <div class="section-header">
          <h3 class="section-title">{{ t('dashboard.myProjects') }}</h3>
        </div>
        <div v-if="showForm" class="inline-form">
          <div class="field">
            <label>{{ t('common.name') }}</label>
            <NbTextInput v-model="newName" :placeholder="t('projects.create.namePlaceholder')" @input="autoSlug" />
          </div>
          <div class="field">
            <label>{{ t('common.slug') }}</label>
            <NbTextInput v-model="newSlug" :placeholder="t('projects.create.slugPlaceholder')" />
          </div>
          <p v-if="formError" class="error">{{ formError }}</p>
          <NbButton variant="primary" @click="createProject">
            {{ t('common.create') }}
          </NbButton>
        </div>

        <div v-if="projects.length === 0 && !showForm" class="empty-state">
          <p>{{ t('dashboard.noProjects') }}</p>
        </div>
        <div v-else class="projects-grid">
          <RouterLink
            v-for="project in projects"
            :key="project.id"
            :to="`/projects/${project.id}`"
            class="project-card"
          >
            <div class="project-card__avatar">
              {{ project.name.slice(0, 2).toUpperCase() }}
            </div>
            <div class="project-card__info">
              <h4>{{ project.name }}</h4>
              <span class="slug">{{ project.slug }}</span>
            </div>
          </RouterLink>
        </div>
      </section>

      <!-- My Active Tasks -->
      <section v-if="tasksByProject.length > 0" class="section">
        <h3 class="section-title">{{ t('dashboard.myTasks') }}</h3>
        <div class="project-tasks">
          <div v-for="group in tasksByProject" :key="group.project.id" class="task-group">
            <RouterLink :to="`/projects/${group.project.id}`" class="project-name">
              {{ group.project.name }}
            </RouterLink>
            <div class="task-list">
              <RouterLink
                v-for="task in group.tasks"
                :key="task.id"
                :to="`/keys/${group.project.id}/${task.key.id}`"
                class="task-card"
              >
                <code class="task-key">{{ task.key.name }}</code>
                <div class="task-meta">
                  <LocaleBadge :code="task.locale.code" />
                  <span class="status-badge" :style="{ background: STATUS_COLORS[task.status] }">
                    {{ STATUS_LABELS[task.status as keyof typeof STATUS_LABELS] }}
                  </span>
                </div>
              </RouterLink>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'
import LocaleBadge from '../components/LocaleBadge.vue'

const auth = useAuthStore()
const { t } = useI18n()
interface Project {
  id: string
  name: string
  slug: string
}

interface Task {
  id: string
  status: string
  key: {
    id: string
    name: string
    project: { id: string; name: string }
  }
  locale: { code: string }
}

const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const loading = ref(true)
const showForm = ref(false)
const newName = ref('')
const newSlug = ref('')
const formError = ref('')

const STATUS_LABELS = computed(() => ({
  IN_PROGRESS: t('common.status.IN_PROGRESS'),
  SUBMITTED: t('common.status.SUBMITTED'),
}))
const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: '#3b82f6',
  SUBMITTED: '#f59e0b',
}

const tasksByProject = computed(() => {
  const map = new Map<string, { project: { id: string; name: string }; tasks: Task[] }>()
  for (const task of tasks.value) {
    const pid = task.key.project.id
    if (!map.has(pid)) map.set(pid, { project: task.key.project, tasks: [] })
    map.get(pid)!.tasks.push(task)
  }
  return [...map.values()]
})

onMounted(async () => {
  try {
    const [t, p] = await Promise.all([apiFetch<Task[]>('/auth/me/tasks'), apiFetch<Project[]>('/projects')])
    tasks.value = t
    projects.value = p
  } finally {
    loading.value = false
  }
})

function autoSlug() {
  newSlug.value = newName.value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

async function createProject() {
  formError.value = ''
  try {
    const project = await apiFetch<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name: newName.value, slug: newSlug.value }),
    })
    projects.value.push(project)
    showForm.value = false
    newName.value = ''
    newSlug.value = ''
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : 'Failed to create project'
  }
}
</script>

<style lang="scss" scoped>
.home-view {
  max-width: 960px;
}

.welcome {
  margin-bottom: 2rem;
  h2 {
    margin: 0;
    font-size: 1.5rem;
  }
}

.loading {
  color: #888;
  padding: 2rem 0;
}

.section {
  margin-bottom: 2.5rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
  color: #333;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.inline-form {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  max-width: 400px;

  .field {
    margin-bottom: 0.75rem;
    label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      margin-bottom: 0.3rem;
      color: #555;
    }
  }
}

.error {
  color: #c0392b;
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.empty-state {
  background: #fff;
  border: 1px dashed #d0d0d0;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  color: #888;
  font-size: 0.9rem;
  p {
    margin: 0;
  }
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}

.project-card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.09);
  }

  &__avatar {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: #ede9fe;
    color: #4f46e5;
    font-size: 0.95rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  &__info {
    min-width: 0;
  }
  h4 {
    margin: 0 0 0.2rem;
    font-size: 0.92rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slug {
    font-size: 0.75rem;
    color: #888;
  }
}

.project-tasks {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.task-group {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem 1.25rem;
}

.project-name {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5b21b6;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.75rem;
  &:hover {
    text-decoration: underline;
  }
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.task-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: #f7f7f9;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
}

.task-key {
  font-size: 0.82rem;
  color: #1a1a2e;
  word-break: break-all;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  margin-left: 0.75rem;
}

.status-badge {
  font-size: 0.7rem;
  color: #fff;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
}
</style>
