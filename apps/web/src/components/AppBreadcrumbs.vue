<template>
  <NbBreadcrumbs title="Nubisco" subtitle="Verba" class="app-breadcrumbs">
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

<style lang="scss" scoped>
// A phone has room for one crumb beside the page actions: the page you are on.
// The brand stays only where there is no crumb to show, and the crumb gives way
// with an ellipsis rather than running off the screen.
@include variables.phone {
  .app-breadcrumbs {
    min-width: 0;
    overflow: hidden;

    &:has(.nb-breadcrumbs__crumbs > *) {
      :deep(.nb-breadcrumbs__brand),
      :deep(> .nb-breadcrumbs__sep) {
        display: none;
      }
    }

    :deep(.nb-breadcrumbs__crumbs) {
      min-width: 0;
      overflow: hidden;
    }

    :deep(.nb-breadcrumbs__crumbs > :not(:last-child)) {
      display: none;
    }

    :deep(.nb-breadcrumbs__crumbs > :last-child) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &::before {
        content: none;
      }
    }
  }
}

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
