<template>
  <!-- Home: the project chooser (fleet standard, "Every rail has the same
       anatomy"), like the CMS's "Choose an application to work on". With more
       than one account the projects are grouped by account, so choosing a
       project is also choosing the account to work in. -->
  <Teleport defer to="#verba-topbar">
    <div class="topbar-actions">
      <NbButton v-if="accountsStore.canCreate && !phone" size="sm" variant="secondary" @click="toggleAccountForm">
        {{ showAccountForm ? t('common.cancel') : t('dashboard.newAccount') }}
      </NbButton>
      <NbButton v-if="accountsStore.accounts.length" variant="primary" size="sm" @click="toggleProjectForm">
        {{ showForm ? t('common.cancel') : t('projects.create.newProject') }}
      </NbButton>
    </div>
  </Teleport>

  <div class="home-view">
    <div class="welcome">
      <h2 v-if="loading || accountsStore.accounts.length">
        {{
          t('dashboard.choose', {
            name: auth.user?.name?.trim() || auth.user?.email,
          })
        }}
      </h2>
      <!-- A phone's top bar holds one action. The rarer one, a new account,
           comes down into the page there. -->
      <NbButton
        v-if="phone && accountsStore.canCreate"
        class="welcome__action"
        size="sm"
        variant="secondary"
        @click="toggleAccountForm"
      >
        {{ showAccountForm ? t('common.cancel') : t('dashboard.newAccount') }}
      </NbButton>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>

    <template v-else>
      <div v-if="showAccountForm" class="inline-form">
        <div class="field">
          <label>{{ t('dashboard.accountName') }}</label>
          <NbTextInput v-model="newAccountName" :placeholder="t('dashboard.accountNamePlaceholder')" />
        </div>
        <p v-if="accountError" class="error">{{ accountError }}</p>
        <NbButton variant="primary" :disabled="!newAccountName.trim()" @click="createAccount">
          {{ t('common.create') }}
        </NbButton>
      </div>

      <!-- Someone signing in for the first time joins no account until an
           owner adds them (workspace AGENTS.md, "Only Jose creates accounts"). -->
      <NbEmptyState
        v-if="accountsStore.accounts.length === 0 && !showAccountForm"
        :title="t('dashboard.noAccountTitle')"
        :description="t('dashboard.noAccountBody')"
        bordered
      />

      <template v-else>
        <div v-if="showForm" class="inline-form">
          <div v-if="accountsStore.accounts.length > 1" class="field">
            <NbSelect v-model="newAccountId" :label="t('dashboard.account')" :options="accountOptions" />
          </div>
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

        <section v-for="group in groups" :key="group.account.id" class="section">
          <div class="section-header">
            <h3 class="section-title">
              {{ grouped ? group.account.name : t('dashboard.myProjects') }}
            </h3>
          </div>
          <div v-if="group.projects.length === 0" class="empty-state">
            <p>{{ t('dashboard.noProjects') }}</p>
          </div>
          <div v-else class="projects-grid">
            <RouterLink
              v-for="project in group.projects"
              :key="project.id"
              :to="`/projects/${project.id}`"
              class="project-card"
              @click="accountsStore.select(group.account.id)"
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
      </template>

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
import { useAccountsStore, type AccountSummary } from '../stores/accounts'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'
import { usePhoneLayout } from '@nubisco/ui'
import LocaleBadge from '../components/LocaleBadge.vue'

const auth = useAuthStore()
const accountsStore = useAccountsStore()
const { t } = useI18n()
const { phone } = usePhoneLayout()
interface Project {
  id: string
  name: string
  slug: string
  accountId?: string
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
const projectsByAccount = ref<Record<string, Project[]>>({})
const loading = ref(true)
const showForm = ref(false)
const newName = ref('')
const newSlug = ref('')
const newAccountId = ref<string>('')
const formError = ref('')
const showAccountForm = ref(false)
const newAccountName = ref('')
const accountError = ref('')

// One section per account. The current account first, so someone in several
// lands on where they were.
const groups = computed(() => {
  const list = [...accountsStore.accounts]
  const current = accountsStore.current?.id
  list.sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : 0))
  return list.map((account: AccountSummary) => ({ account, projects: projectsByAccount.value[account.id] ?? [] }))
})
const grouped = computed(() => accountsStore.accounts.length > 1)
const accountOptions = computed(() => accountsStore.accounts.map((a) => ({ label: a.name, value: a.id })))

async function loadProjects() {
  const entries = await Promise.all(
    accountsStore.accounts.map(
      async (a) =>
        [a.id, await apiFetch<Project[]>(`/projects?account=${encodeURIComponent(a.id)}`).catch(() => [])] as const,
    ),
  )
  projectsByAccount.value = Object.fromEntries(entries)
}

function toggleProjectForm() {
  showForm.value = !showForm.value
  showAccountForm.value = false
  newAccountId.value = accountsStore.current?.id ?? accountsStore.accounts[0]?.id ?? ''
}

function toggleAccountForm() {
  showAccountForm.value = !showAccountForm.value
  showForm.value = false
}

async function createAccount() {
  accountError.value = ''
  try {
    const account = await accountsStore.create(newAccountName.value.trim())
    projectsByAccount.value = { ...projectsByAccount.value, [account.id]: [] }
    showAccountForm.value = false
    newAccountName.value = ''
  } catch (e: unknown) {
    accountError.value = e instanceof Error ? e.message : 'Failed to create the account'
  }
}

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
    await accountsStore.load()
    const [t] = await Promise.all([apiFetch<Task[]>('/auth/me/tasks'), loadProjects()])
    tasks.value = t
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
    const accountId = newAccountId.value || accountsStore.current?.id || ''
    const project = await apiFetch<Project>(`/projects?account=${encodeURIComponent(accountId)}`, {
      method: 'POST',
      body: JSON.stringify({ name: newName.value, slug: newSlug.value }),
    })
    projectsByAccount.value = {
      ...projectsByAccount.value,
      [accountId]: [project, ...(projectsByAccount.value[accountId] ?? [])],
    }
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

.topbar-actions {
  display: flex;
  gap: var(--nb-spacing-8);
}

.welcome {
  margin-bottom: 2rem;

  &__action {
    margin-top: var(--nb-spacing-12);
  }

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
