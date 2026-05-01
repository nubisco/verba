import { ref } from 'vue'

// Singleton reactive state: shared between DefaultLayout and any view
const _inspectorVisible = ref(false)

export function useLayoutSlots() {
  return {
    inspectorVisible: _inspectorVisible,
    openInspector() {
      _inspectorVisible.value = true
    },
    closeInspector() {
      _inspectorVisible.value = false
    },
  }
}
