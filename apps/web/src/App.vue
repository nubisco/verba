<template>
  <RouterView />
  <ModalManager ref="modalManagerRef" />
  <NbToaster placement="bottom-end" />
</template>

<script setup lang="ts">
import { ref, provide } from 'vue'
import ModalManager from '@/components/ModalManager.vue'

const modalManagerRef = ref<InstanceType<typeof ModalManager> | null>(null)
provide('$modal', modalManagerRef)
</script>

<style lang="scss">
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  color: var(--nb-c-text);
}

// ─── page-topbar: shared topbar row injected by views via Teleport ────────────
// Views do: <Teleport to="#verba-topbar"><div class="page-topbar">...</div></Teleport>
.page-topbar {
  .topbar-meta {
    font-size: 0.75rem;
    color: var(--nb-c-text-subtle);
    white-space: nowrap;
  }

  .topbar-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .topbar-filters {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
}

// Views render <div class="page-header"> as their first element.
// DefaultLayout's .app-main provides the scrollable container.
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;

  h2 {
    margin: 0 0 0.15rem;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--nb-c-text);
    line-height: 1.2;
  }

  .page-header-meta {
    font-size: 0.78rem;
    color: var(--nb-c-text-subtle);
  }

  .page-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
}

// ─── Shared table overflow guard ──────────────────────────────────────────────
// Prevent any table in any view from overflowing its container. The header is
// NbDataTable's: it keeps it sticky and paints it from the layer the table
// sits on, so nothing here pins a layer on it.
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  th,
  td {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
