<template>
  <NbBreadcrumbs title="Nubisco" subtitle="Verba">
    <template v-for="(crumb, i) in crumbs" :key="i">
      <NbIcon v-if="i > 0" name="caret-right" :size="12" class="bc-sep" />
      <code v-if="crumb.isCode" class="bc-key">{{ crumb.label }}</code>
      <span v-else class="bc-label">{{ crumb.label }}</span>
    </template>
  </NbBreadcrumbs>
</template>

<script setup lang="ts">
import { useBreadcrumbs } from '../composables/useBreadcrumbs'

const { crumbs } = useBreadcrumbs()
</script>

<style scoped>
.bc-sep {
  opacity: 0.4;
  flex-shrink: 0;
}

.bc-label {
  color: var(--nb-c-text-primary);
}

.bc-key {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 0.8em;
  background: rgba(124, 58, 237, 0.08);
  color: #7c3aed;
  border: 1px solid rgba(124, 58, 237, 0.2);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}
</style>
