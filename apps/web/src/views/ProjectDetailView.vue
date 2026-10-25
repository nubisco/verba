<template>
  <div>
    <NbSkeleton v-if="store.loading" variant="block" :height="120" radius="md" label="Loading project" />
    <template v-else-if="store.project">
      <div class="page-header">
        <div class="header-main">
          <ProjectAvatar :avatar="store.project.avatar" :name="store.project.name" size="lg" />
          <div>
            <h2>{{ store.project.name }}</h2>
            <span class="slug">{{ store.project.slug }}</span>
          </div>
        </div>
      </div>

      <NbTabs
        :model-value="String(route.name)"
        :items="tabs"
        aria-label="Project"
        class="tab-bar"
        @update:model-value="router.push({ name: $event, params: { id: projectId } })"
      />

      <RouterView />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../stores/project'
import ProjectAvatar from '../components/ProjectAvatar.vue'

const route = useRoute()
const router = useRouter()

// Each tab is a child route, so the URL stays the source of truth.
const tabs = [
  { id: 'project-overview', label: 'Overview' },
  { id: 'project-settings', label: 'Settings' },
  { id: 'project-import', label: 'Import' },
  { id: 'project-export', label: 'Export' },
  { id: 'project-history', label: 'History' },
]
const projectId = computed(() => route.params.id as string)
const store = useProjectStore()

watch(
  projectId,
  (id) => {
    if (id) store.load(id)
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
.page-header {
  margin-bottom: 1rem;
  h2 {
    margin: 0.25rem 0 0.2rem;
    font-size: 1.4rem;
  }
  .slug {
    font-size: 0.8rem;
    color: var(--nb-c-text-subtle);
  }
}

.header-main {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.project-avatar-lg {
  font-size: 2rem;
  line-height: 1;
}

.tab-bar {
  margin-bottom: 1.5rem;
}
</style>
