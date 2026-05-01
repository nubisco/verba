<template>
  <div>
    <ProjectExportPanel :project-id="projectId" />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import ProjectExportPanel from '../components/ProjectExportPanel.vue'

const route = useRoute()
const projectId = route.params.id as string
</script>

<style lang="scss" scoped></style>
