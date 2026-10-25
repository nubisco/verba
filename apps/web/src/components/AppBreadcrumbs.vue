<template>
  <!-- NbBreadcrumbs draws the separators between crumbs, and on a phone shows
       only the page you are on, cut with an ellipsis (collapse="phone"). -->
  <NbBreadcrumbs title="Nubisco" subtitle="Verba" collapse="phone">
    <template v-for="(crumb, i) in crumbs" :key="i">
      <code v-if="crumb.isCode" class="bc-key">{{ crumb.label }}</code>
      <span v-else class="bc-label">{{ crumb.label }}</span>
    </template>
  </NbBreadcrumbs>
</template>

<script setup lang="ts">
import { useBreadcrumbs } from '../composables/useBreadcrumbs'

const { crumbs } = useBreadcrumbs()
</script>

<style lang="scss" scoped>
.bc-label {
  color: var(--nb-c-text-primary);
}

.bc-key {
  font-family: var(--nb-font-family-mono);
  font-size: 0.8em;
  background: color-mix(in srgb, var(--nb-c-primary) 8%, transparent);
  color: var(--nb-c-primary);
  border: 1px solid color-mix(in srgb, var(--nb-c-primary) 20%, transparent);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}
</style>
