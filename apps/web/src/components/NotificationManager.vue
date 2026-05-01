<script setup lang="ts">
import { NbToast } from '@nubisco/ui'
import { useNotificationsStore } from '@/stores/notifications'

const store = useNotificationsStore()
</script>

<template>
  <Teleport to="body">
    <div class="notification-manager" aria-live="polite" aria-label="Notifications">
      <TransitionGroup name="nb-notif" tag="div" class="notification-manager__list">
        <NbToast
          v-for="n in store.visible"
          :key="n.id"
          :variant="n.variant"
          :title="n.title"
          :message="n.message"
          :duration="n.duration"
          :cta="n.cta"
          @close="store.remove(n.id)"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.notification-manager {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: var(--nb-z-toast, 400);
  pointer-events: none;
}

.notification-manager__list {
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
  align-items: flex-end;

  // Re-enable pointer events on individual toasts
  :deep(.nb-toast) {
    pointer-events: all;
  }
}

// ─── TransitionGroup animations ───────────────────────────────────────────────
.nb-notif-enter-active,
.nb-notif-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.nb-notif-enter-from {
  opacity: 0;
  transform: translateX(24px);
}

.nb-notif-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

.nb-notif-move {
  transition: transform 0.2s ease;
}
</style>
