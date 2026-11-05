<template>
  <!-- The project page: Overview, Import, Export and History, each a child
       route. The trail already names the project, with its logo, and switches
       to another (utils/trail.ts), so the page does not repeat it in a
       heading (fleet standard, "The trail names the page, so the page does not
       repeat it"). Its tabs sit in the shell's fixedbar, where Settings keeps
       its own. -->
  <div>
    <component :is="fixedbar.Outlet">
      <NbTabs
        :model-value="String(route.name)"
        :items="tabs"
        aria-label="Project"
        variant="line"
        @update:model-value="router.push({ name: $event, params: { id: projectId } })"
      />
    </component>

    <NbSkeleton v-if="store.loading" variant="block" :height="120" radius="md" label="Loading project" />
    <RouterView v-else-if="store.project" />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useShellSlot } from '@nubisco/ui'
import { useProjectStore } from '../stores/project'

const route = useRoute()
const router = useRouter()
const fixedbar = useShellSlot('fixedbar')

// Each tab is a child route, so the URL stays the source of truth. Settings
// is not one of them: it is its own page, the last item of the project's group
// in the rail.
const tabs = [
  { id: 'project-overview', label: 'Overview' },
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
