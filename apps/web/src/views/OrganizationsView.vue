<template>
  <Teleport defer to="#verba-topbar">
    <NbButton v-if="isOrgsEnabled" variant="primary" @click="showForm = !showForm">
      {{ showForm ? 'Cancel' : '+ New Organization' }}
    </NbButton>
  </Teleport>

  <div>
    <div v-if="!isOrgsEnabled" class="feature-disabled">
      <p>Organizations feature is not enabled.</p>
    </div>

    <template v-else>
      <div v-if="showForm" class="inline-form">
        <h3>New Organization</h3>
        <div class="field">
          <label>Name</label>
          <NbTextInput v-model="newName" placeholder="My Org" @input="autoSlug" />
        </div>
        <div class="field">
          <label>Slug</label>
          <NbTextInput v-model="newSlug" placeholder="my-org" />
        </div>
        <p v-if="formError" class="error">{{ formError }}</p>
        <NbButton variant="primary" @click="createOrg">Create</NbButton>
      </div>

      <div v-if="loading" class="skeleton-list">
        <div v-for="n in 3" :key="n" class="skeleton-card" />
      </div>

      <div v-else-if="orgs.length === 0" class="empty-state">
        <p>No organizations yet. Create your first one!</p>
      </div>

      <div v-else class="orgs-grid">
        <div v-for="org in orgs" :key="org.id" class="org-card">
          <h3>{{ org.name }}</h3>
          <span class="slug">{{ org.slug }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { apiFetch } from '../api'
import { useInstanceConfigStore } from '../stores/instanceConfig'

const instanceConfig = useInstanceConfigStore()
const isOrgsEnabled = computed(() => instanceConfig.hasFeature('organizations'))

interface Organization {
  id: string
  name: string
  slug: string
}

const orgs = ref<Organization[]>([])
const loading = ref(true)
const showForm = ref(false)
const newName = ref('')
const newSlug = ref('')
const formError = ref('')

onMounted(async () => {
  if (!isOrgsEnabled.value) return
  try {
    orgs.value = await apiFetch<Organization[]>('/organizations')
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

async function createOrg() {
  formError.value = ''
  try {
    const org = await apiFetch<Organization>('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name: newName.value, slug: newSlug.value }),
    })
    orgs.value.push(org)
    showForm.value = false
    newName.value = ''
    newSlug.value = ''
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : 'Failed to create organization'
  }
}
</script>

<style lang="scss" scoped>
.feature-disabled {
  padding: 3rem;
  text-align: center;
  color: #888;
  background: #fff;
  border-radius: 8px;
  border: 1px dashed #d0d0d0;
}

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

.orgs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.org-card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;

  h3 {
    margin: 0 0 0.4rem;
    font-size: 1rem;
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
