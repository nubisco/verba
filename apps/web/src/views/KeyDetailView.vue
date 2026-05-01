<template>
  <KeyDetailPanel :key-id="keyId" :project-id="keyId" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import KeyDetailPanel from '../components/KeyDetailPanel.vue'
const route = useRoute()

const keyId = computed((): string => {
  return route.params.keyId as string
})
</script>
