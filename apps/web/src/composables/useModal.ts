import { inject, type Ref } from 'vue'
import type ModalManager from '@/components/ModalManager.vue'
import type { ModalConfig } from '@/components/ModalManager.vue'

type ModalManagerInstance = InstanceType<typeof ModalManager>

export function useModal() {
  const ref = inject<Ref<ModalManagerInstance | null>>('$modal')

  if (!ref) {
    throw new Error(
      '[useModal] ModalManager is not provided. ' +
        'Make sure <ModalManager ref="..." /> is mounted in App.vue and provide("$modal", ref) is called.',
    )
  }

  return {
    openModal: (name: Parameters<ModalManagerInstance['openModal']>[0], config?: ModalConfig) =>
      ref.value!.openModal(name, config),
    closeModal: (result?: unknown) => ref.value!.closeModal(result),
    dismissModal: (reason?: unknown) => ref.value!.dismissModal(reason),
  }
}
