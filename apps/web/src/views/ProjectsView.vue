<template>
  <Teleport defer to="#verba-topbar">
    <NbGrid align="center" justify="between" class="page-topbar" grow>
      <NbBreadcrumbs title="Nubisco" subtitle="Verba">{{ t('projects.list.title') }}</NbBreadcrumbs>
      <div class="topbar-actions">
        <NbButton variant="primary" size="sm" @click="showForm = !showForm">
          {{ showForm ? t('common.cancel') : t('projects.create.newProject') }}
        </NbButton>
      </div>
    </NbGrid>
  </Teleport>

  <div>
    <NbPanel v-if="showForm" class="inline-form">
      <h3>{{ t('projects.create.newProject') }}</h3>
      <div class="field">
        <NbTextInput
          v-model="newName"
          :label="t('common.name')"
          :placeholder="t('projects.create.namePlaceholder')"
          @input="autoSlug"
        />
      </div>
      <div class="field">
        <NbTextInput v-model="newSlug" :label="t('common.slug')" :placeholder="t('projects.create.slugPlaceholder')" />
      </div>
      <p v-if="formError" class="error">{{ formError }}</p>
      <NbButton variant="primary" @click="createProject">
        {{ t('common.create') }}
      </NbButton>
    </NbPanel>

    <div v-if="loading" class="skeleton-list">
      <NbSkeleton
        v-for="n in 3"
        :key="n"
        variant="block"
        :height="80"
        radius="md"
        :label="n === 1 ? t('common.loading') : undefined"
      />
    </div>

    <NbEmptyState v-else-if="projects.length === 0" :title="t('projects.list.empty')" bordered />

    <NbCardGrid v-else min="220px">
      <NbCard
        v-for="project in projects"
        :key="project.id"
        orientation="horizontal"
        :to="`/projects/${project.id}`"
        :title="project.name"
        :subtitle="project.slug"
      >
        <template #icon>
          <span class="project-avatar" aria-hidden="true">{{ project.name.slice(0, 2).toUpperCase() }}</span>
        </template>
      </NbCard>
    </NbCardGrid>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Project {
  id: string
  name: string
  slug: string
}

const projects = ref<Project[]>([])
const loading = ref(true)
const showForm = ref(false)
const newName = ref('')
const newSlug = ref('')
const formError = ref('')

onMounted(async () => {
  try {
    projects.value = await apiFetch<Project[]>('/projects')
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
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;

  h2 {
    margin: 0;
    font-size: 1.4rem;
  }
}

.inline-form {
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  max-width: 400px;

  h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
  }
}

.field {
  margin-bottom: 0.85rem;
}

.error {
  color: var(--nb-c-status-error);
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

// NbCardGrid lays the projects out and NbCard paints them from where they sit.
// The initials tile is the project's mark until it has a picture of its own.
.project-avatar {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nb-c-primary) 12%, transparent);
  color: var(--nb-c-primary);
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.05em;
}
</style>
