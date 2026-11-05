<template>
  <!-- The project's own configuration, the last item of the project's group
       in the rail. One tab strip in the shell's fixedbar, the shape Acta's
       space Settings set, with the tab in the URL (?tab=). Deleting the
       project sits at the foot of General, as archiving a space does in
       Acta, rather than as a red tab of its own. Each section owns its own
       data and dialogs, so this view is only the switch. -->
  <div class="settings">
    <component :is="fixedbar.Outlet">
      <NbTabs v-model="tab" :items="tabs" aria-label="Project settings sections" variant="line" />
    </component>

    <NbSkeleton v-if="!ready" variant="block" :height="200" radius="md" label="Loading the project" />

    <template v-else-if="store.project">
      <ProjectSettingsGeneral v-if="tab === 'general'" :project-id="projectId" />
      <ProjectSettingsLocales v-else-if="tab === 'locales'" :project-id="projectId" />
      <ProjectSettingsNamespaces v-else-if="tab === 'namespaces'" :project-id="projectId" />
      <ProjectSettingsMembers v-else-if="tab === 'members'" :project-id="projectId" />
      <ProjectSettingsAi
        v-else-if="tab === 'ai' && store.isAdmin"
        :project-id="projectId"
        :locales="store.locales"
        @changed="onAiChanged"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useShellSlot } from '@nubisco/ui'
import { useProjectStore } from '../stores/project'
import { useSettingsTab, type SettingsTab } from '../composables/useSettingsTab'
import ProjectSettingsGeneral from '../components/settings/ProjectSettingsGeneral.vue'
import ProjectSettingsLocales from '../components/settings/ProjectSettingsLocales.vue'
import ProjectSettingsNamespaces from '../components/settings/ProjectSettingsNamespaces.vue'
import ProjectSettingsMembers from '../components/settings/ProjectSettingsMembers.vue'
import ProjectSettingsAi from '../components/settings/ProjectSettingsAi.vue'

const route = useRoute()
const store = useProjectStore()
const fixedbar = useShellSlot('fixedbar')

const projectId = computed(() => route.params.id as string)

// The page loads the project itself now that it is not a tab of the project
// page, which used to do it.
watch(
  projectId,
  (id) => {
    if (id) void store.load(id)
  },
  { immediate: true },
)
const ready = computed(() => !store.loading && store.projectId === projectId.value)

const tabs = computed<SettingsTab[]>(() => [
  { id: 'general', label: 'General' },
  { id: 'locales', label: 'Locales' },
  { id: 'namespaces', label: 'Namespaces' },
  { id: 'members', label: 'Members' },
  // The provider key is the project's admins' to hold.
  ...(store.isAdmin ? [{ id: 'ai', label: 'AI' }] : []),
])
// The Danger zone was a tab of its own. Deleting is at the foot of General now.
const tab = useSettingsTab(tabs, { danger: 'general' })

// Read and saved by ProjectSettingsAi through /projects/:id/ai/settings. The
// project store only keeps what the editor needs to show the suggest button.
function onAiChanged(settings: { enabled: boolean; hasKey: boolean }) {
  if (!store.project) return
  store.project.aiEnabled = settings.enabled
  store.project.aiHasKey = settings.hasKey
}
</script>

<style scoped lang="scss">
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);
  padding-block-end: var(--nb-spacing-32);
}
</style>
