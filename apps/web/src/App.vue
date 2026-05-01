<template>
  <RouterView />
  <ModalManager ref="modalManagerRef" />
  <NotificationManager />
</template>

<script setup lang="ts">
import { ref, provide } from 'vue'
import ModalManager from '@/components/ModalManager.vue'
import NotificationManager from '@/components/NotificationManager.vue'

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
  color: #1a1a1a;
}

// ─── page-topbar: shared topbar row injected by views via Teleport ────────────
// Views do: <Teleport to="#verba-topbar"><div class="page-topbar">...</div></Teleport>
.page-topbar {
  .topbar-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.875rem;

    a {
      color: #6b7280;
      text-decoration: none;
      font-weight: 500;

      &:hover {
        color: #1a1a2e;
      }
    }

    .sep {
      color: #d1d5db;
    }

    .current {
      font-weight: 600;
      color: #1a1a2e;
    }
  }

  .topbar-meta {
    font-size: 0.75rem;
    color: #9ca3af;
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
    color: #1a1a2e;
    line-height: 1.2;
  }

  .page-header-meta {
    font-size: 0.78rem;
    color: #9ca3af;
  }

  .page-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
}

// ─── Shared table overflow guard ──────────────────────────────────────────────
// Prevent any table in any view from overflowing its container
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;

  thead {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fff;
  }

  th,
  td {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
