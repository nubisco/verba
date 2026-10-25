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
      <NbPanel v-if="showAccountForm" class="inline-form">
        <div class="field">
          <NbTextInput
            v-model="newAccountName"
            :label="t('dashboard.accountName')"
            :placeholder="t('dashboard.accountNamePlaceholder')"
          />
        </div>
        <p v-if="accountError" class="error">{{ accountError }}</p>
        <NbButton variant="primary" :disabled="!newAccountName.trim()" @click="createAccount">
          {{ t('common.create') }}
        </NbButton>
      </NbPanel>

      <!-- Someone signing in for the first time joins no account until an
           owner adds them (workspace AGENTS.md, "Only Jose creates accounts"). -->
      <NbEmptyState
        v-if="accountsStore.accounts.length === 0 && !showAccountForm"
        :title="t('dashboard.noAccountTitle')"
        :description="t('dashboard.noAccountBody')"
        bordered
      />

      <template v-else>
        <NbPanel v-if="showForm" class="inline-form">
          <div v-if="accountsStore.accounts.length > 1" class="field">
            <NbSelect v-model="newAccountId" :label="t('dashboard.account')" :options="accountOptions" />
          </div>
          <div class="field">
            <NbTextInput
              v-model="newName"
              :label="t('common.name')"
              :placeholder="t('projects.create.namePlaceholder')"
              @input="autoSlug"
            />
          </div>
          <div class="field">
            <NbTextInput
              v-model="newSlug"
              :label="t('common.slug')"
              :placeholder="t('projects.create.slugPlaceholder')"
            />
          </div>
          <p v-if="formError" class="error">{{ formError }}</p>
          <NbButton variant="primary" @click="createProject">
            {{ t('common.create') }}
          </NbButton>
        </NbPanel>

        <section v-for="group in groups" :key="group.account.id" class="section">
          <div class="section-header">
            <h3 class="section-title">
              {{ grouped ? group.account.name : t('dashboard.myProjects') }}
            </h3>
          </div>
          <NbEmptyState v-if="group.projects.length === 0" :title="t('dashboard.noProjects')" size="sm" bordered />
          <NbCardGrid v-else min="220px" gap="sm">
            <NbCard
              v-for="project in group.projects"
              :key="project.id"
              :title="project.name"
              :subtitle="project.slug"
              :to="`/projects/${project.id}`"
              @click="accountsStore.select(group.account.id)"
            >
              <template #icon>
                <ProjectAvatar :avatar="project.avatar" :name="project.name" />
              </template>
            </NbCard>
          </NbCardGrid>
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
            <NbCardGrid min="220px" gap="sm">
              <NbCard v-for="task in group.tasks" :key="task.id" :to="`/keys/${group.project.id}/${task.key.id}`">
                <template #title>
                  <code class="task-key">{{ task.key.name }}</code>
                </template>
                <template #footer>
                  <LocaleBadge :code="task.locale.code" />
                  <NbBadge size="sm" :variant="STATUS_VARIANTS[task.status] ?? 'grey'">
                    {{ STATUS_LABELS[task.status as keyof typeof STATUS_LABELS] }}
                  </NbBadge>
                </template>
              </NbCard>
            </NbCardGrid>
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
import ProjectAvatar from '../components/ProjectAvatar.vue'

const auth = useAuthStore()
const accountsStore = useAccountsStore()
const { t } = useI18n()
const { phone } = usePhoneLayout()
interface Project {
  id: string
  name: string
  slug: string
  avatar?: string | null
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
const STATUS_VARIANTS: Record<string, 'blue' | 'orange'> = {
  IN_PROGRESS: 'blue',
  SUBMITTED: 'orange',
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
  color: var(--nb-c-text-subtle);
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
  color: var(--nb-c-text);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.inline-form {
  padding: 1.25rem;
  margin-bottom: 1rem;
  max-width: 400px;

  .field {
    margin-bottom: 0.75rem;
  }
}

.error {
  color: var(--nb-c-status-error);
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.project-tasks {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.task-group {
  background: var(--nb-c-layer-1);
  border: 1px solid var(--nb-c-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
}

.project-name {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--nb-c-primary);
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.75rem;
  &:hover {
    text-decoration: underline;
  }
}

.task-key {
  font-size: 0.82rem;
  color: var(--nb-c-text);
  word-break: break-all;
}
</style>
