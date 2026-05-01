<template>
  <div>
    <div v-if="store.loading" class="skeleton-header" />
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

      <div class="tab-bar">
        <RouterLink
          :to="`/projects/${projectId}`"
          class="tab-btn"
          :class="{ active: route.name === 'project-overview' }"
          >Overview</RouterLink
        >
        <RouterLink
          :to="`/projects/${projectId}/settings`"
          class="tab-btn"
          :class="{ active: route.name === 'project-settings' }"
          >Settings</RouterLink
        >
        <RouterLink
          :to="`/projects/${projectId}/import`"
          class="tab-btn"
          :class="{ active: route.name === 'project-import' }"
          >Import</RouterLink
        >
        <RouterLink
          :to="`/projects/${projectId}/export`"
          class="tab-btn"
          :class="{ active: route.name === 'project-export' }"
          >Export</RouterLink
        >
        <RouterLink
          :to="`/projects/${projectId}/history`"
          class="tab-btn"
          :class="{ active: route.name === 'project-history' }"
          >History</RouterLink
        >
      </div>

      <RouterView />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '../stores/project'
import ProjectAvatar from '../components/ProjectAvatar.vue'

const route = useRoute()
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
    color: #888;
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
  display: flex;
  gap: 0;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: 1.5rem;
}

.tab-btn {
  padding: 0.6rem 1.2rem;
  border: none;
  background: none;
  font-size: 0.88rem;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition:
    color 0.15s,
    border-color 0.15s;
  white-space: nowrap;
  text-decoration: none;

  &:hover {
    color: #1a1a2e;
  }

  &.active {
    color: #5b21b6;
    border-bottom-color: #5b21b6;
    font-weight: 600;
  }
}

.skeleton-header {
  height: 120px;
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
</style>
