<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    multiline?: boolean
    placeholder?: string
    availableKeys?: string[]
    showSuggest?: boolean
    suggesting?: boolean
  }>(),
  {
    disabled: false,
    multiline: true,
    placeholder: undefined,
    availableKeys: () => [],
    showSuggest: false,
    suggesting: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
  suggest: []
}>()

const editorRef = ref()

const localValue = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

const autocomplete = reactive({
  visible: false,
  query: '',
  filtered: [] as string[],
  selectedIndex: 0,
})

function highlight(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .replace(/(@:[a-zA-Z0-9_.]+)/g, '<span class="hl-keyref">$1</span>')
    .replace(/(\{[^}]+\})/g, '<span class="hl-placeholder">$1</span>')
}

function checkAutocomplete() {
  const nativeEl = editorRef.value?.nativeEl?.value
  if (!nativeEl) return
  const pos = nativeEl.selectionStart ?? 0
  const before = nativeEl.value.slice(0, pos)
  const match = before.match(/@:([a-zA-Z0-9_.]*)$/)
  if (match && props.availableKeys?.length) {
    const query = match[1]
    autocomplete.query = query
    autocomplete.filtered = (props.availableKeys ?? [])
      .filter((k) => k.toLowerCase().startsWith(query.toLowerCase()))
      .slice(0, 10)
    autocomplete.visible = autocomplete.filtered.length > 0
    autocomplete.selectedIndex = 0
  } else {
    autocomplete.visible = false
  }
}

function insertAutocomplete(key: string) {
  const nativeEl = editorRef.value?.nativeEl?.value
  if (!nativeEl) return
  const pos = nativeEl.selectionStart ?? 0
  const before = nativeEl.value.slice(0, pos)
  const after = nativeEl.value.slice(pos)
  const match = before.match(/@:[a-zA-Z0-9_.]*$/)
  if (!match) return
  const newBefore = before.slice(0, before.length - match[0].length) + '@:' + key
  const newValue = newBefore + after
  localValue.value = newValue
  autocomplete.visible = false
  nextTick(() => {
    const el = editorRef.value?.nativeEl?.value
    if (el) {
      const newPos = newBefore.length
      el.setSelectionRange(newPos, newPos)
      el.focus()
    }
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (!autocomplete.visible) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    autocomplete.selectedIndex = Math.min(autocomplete.selectedIndex + 1, autocomplete.filtered.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    autocomplete.selectedIndex = Math.max(autocomplete.selectedIndex - 1, 0)
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (autocomplete.visible && autocomplete.filtered.length > 0) {
      e.preventDefault()
      insertAutocomplete(autocomplete.filtered[autocomplete.selectedIndex])
    }
  } else if (e.key === 'Escape') {
    autocomplete.visible = false
  }
}
</script>

<template>
  <NbTextInput
    ref="editorRef"
    v-model="localValue"
    :multiline="multiline"
    :highlight="highlight"
    :disabled="disabled"
    :placeholder="placeholder ?? ''"
    helper="Use {variables} for placeholders and @:key.name for key references"
    class="t-editor"
    @keydown="handleKeydown"
    @focus="emit('focus')"
    @input="nextTick(checkAutocomplete)"
  >
    <!-- AI suggest button in the trailing actions area -->
    <template v-if="showSuggest && !disabled" #actions>
      <NbButton
        variant="secondary"
        :title="suggesting ? 'Getting suggestion…' : 'AI suggest translation'"
        tabindex="-1"
        @mousedown.prevent="emit('suggest')"
      >
        <NbIcon :animation="suggesting ? 'heart' : null" name="sparkle" :size="14" />
      </NbButton>
    </template>

    <!-- Autocomplete dropdown -->
    <template v-if="autocomplete.visible" #dropdown>
      <div class="t-editor__autocomplete">
        <NbButton
          v-for="(item, i) in autocomplete.filtered"
          :key="item"
          class="t-editor__ac-item"
          :class="{ 'is-active': i === autocomplete.selectedIndex }"
          @mousedown.prevent="insertAutocomplete(item)"
        >
          @:{{ item }}
        </NbButton>
      </div>
    </template>
  </NbTextInput>
</template>

<style lang="scss" scoped>
:deep(.hl-placeholder) {
  color: #2563eb;
  font-weight: 600;
}

:deep(.hl-keyref) {
  color: #7c3aed;
  font-style: italic;
}

.t-editor__autocomplete {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  z-index: 100;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  min-width: 200px;
}

.t-editor__ac-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-family: ui-monospace, monospace;
  border: none;
  background: none;
  cursor: pointer;
  color: #7c3aed;

  &.is-active,
  &:hover {
    background: #ede9fe;
  }
}
</style>
