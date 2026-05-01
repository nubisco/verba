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
    <div v-if="showForm" class="inline-form">
      <h3>{{ t('projects.create.newProject') }}</h3>
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

    <div v-if="loading" class="skeleton-list">
      <div v-for="n in 3" :key="n" class="skeleton-card" />
    </div>

    <div v-else-if="projects.length === 0" class="empty-state">
      <p>{{ t('projects.list.empty') }}</p>
    </div>

    <div v-else class="projects-grid">
      <RouterLink v-for="project in projects" :key="project.id" :to="`/projects/${project.id}`" class="project-card">
        <div class="project-card__avatar">
          {{ project.name.slice(0, 2).toUpperCase() }}
        </div>
        <div class="project-card__info">
          <h3>{{ project.name }}</h3>
          <span class="slug">{{ project.slug }}</span>
        </div>
      </RouterLink>
    </div>
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
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
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

  label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.3rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
}

.error {
  color: #c0392b;
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.project-card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
  display: flex;
  align-items: center;
  gap: 1rem;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  }

  &__avatar {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    background: #ede9fe;
    color: #4f46e5;
    font-size: 1rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    letter-spacing: 0.05em;
  }

  &__info {
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .slug {
    font-size: 0.8rem;
    color: #888;
  }
}

.skeleton-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.skeleton-card {
  height: 80px;
  background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 8px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.empty-state {
  padding: 3rem;
  text-align: center;
  color: #888;
  background: #fff;
  border-radius: 8px;
  border: 1px dashed #d0d0d0;
}
</style>
