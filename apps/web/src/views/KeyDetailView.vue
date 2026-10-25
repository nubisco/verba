<template>
  <KeyDetailPanel :key-id="keyId" :project-id="projectId" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import KeyDetailPanel from '../components/KeyDetailPanel.vue'
const route = useRoute()

const projectId = computed((): string => route.params.id as string)
const keyId = computed((): string => route.params.keyId as string)
</script>
