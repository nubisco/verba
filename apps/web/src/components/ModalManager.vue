<template>
  <!-- Each modal component owns its own NbModal shell and all its slots -->
  <component
    :is="currentModal"
    v-if="isOpen && currentModal"
    :config="currentConfig"
    @resolve="closeModal"
    @reject="dismissModal"
  />
</template>

<script setup lang="ts">
import { ref, shallowRef, type Component } from 'vue'

// ─── Modal registry ───────────────────────────────────────────────────────────
// All app modals are pre-registered here with defineAsyncComponent so they
// are code-split. Each modal component owns its own NbModal shell.
//
// Example:
//   confirmDelete: defineAsyncComponent(
//     () => import('@/components/modals/ConfirmDeleteModal.vue')
//   ),
const MODALS = {
  // modals go here
} as const

type ModalName = keyof typeof MODALS

/** Arbitrary data bag passed to the modal component via :config */
export type ModalConfig = Record<string, unknown>

// ─── State ────────────────────────────────────────────────────────────────────
const isOpen = ref(false)
const currentModal = shallowRef<Component | null>(null)
const currentConfig = ref<ModalConfig | null>(null)

type Resolver = (value: unknown) => void
let resolvePromise: Resolver | null = null
let rejectPromise: Resolver | null = null

// ─── API ──────────────────────────────────────────────────────────────────────

function openModal(name: ModalName, config?: ModalConfig): Promise<unknown> {
  return new Promise((resolve, reject) => {
    currentModal.value = MODALS[name]
    currentConfig.value = config ?? null
    resolvePromise = resolve
    rejectPromise = reject
    isOpen.value = true
  })
}

function closeModal(result?: unknown) {
  isOpen.value = false
  resolvePromise?.(result)
  _reset()
}

function dismissModal(reason?: unknown) {
  isOpen.value = false
  rejectPromise?.(reason)
  _reset()
}

function _reset() {
  currentModal.value = null
  currentConfig.value = null
  resolvePromise = null
  rejectPromise = null
}

defineExpose({ openModal, closeModal, dismissModal })
</script>
