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

    <!-- Key-reference suggestions: the product decides when (after "@:")
         and which keys, NbSuggestionList does the keyboard and the a11y. -->
    <template v-if="autocomplete.visible" #dropdown>
      <NbSuggestionList
        v-model:open="autocomplete.visible"
        :items="autocomplete.filtered"
        placement="top"
        label="Key references"
        @select="insertAutocomplete"
      >
        <template #item="{ item }">
          <code class="t-editor__ac-item">@:{{ item }}</code>
        </template>
      </NbSuggestionList>
    </template>
  </NbTextInput>
</template>

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

// NbTextInput exposes `nativeEl` as a ref, which the component proxy unwraps,
// so this is the element itself, not a ref to it.
const editorRef = ref<{ nativeEl?: HTMLTextAreaElement | HTMLInputElement }>()

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
  return (
    escaped
      .replace(/(@:[a-zA-Z0-9_.]+)/g, '<span class="hl-keyref">$1</span>')
      // ICU {variables}
      .replace(/(\{[^}]+\})/g, '<span class="hl-placeholder">$1</span>')
      // printf placeholders (%@, %lld, %.2f, positional %1$@, literal %%)
      .replace(
        /(%(?:\d+\$)?[-+ 0#]*\d*(?:\.\d+)?(?:hh|h|ll|l|q|L|z|j|t)?[@diouxXeEfFgGaAcspn%])/g,
        '<span class="hl-placeholder">$1</span>',
      )
  )
}

function checkAutocomplete() {
  const nativeEl = editorRef.value?.nativeEl as HTMLTextAreaElement | undefined
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
  const nativeEl = editorRef.value?.nativeEl as HTMLTextAreaElement | undefined
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
    const el = editorRef.value?.nativeEl as HTMLTextAreaElement | undefined
    if (el) {
      const newPos = newBefore.length
      el.setSelectionRange(newPos, newPos)
      el.focus()
    }
  })
}
</script>

<style lang="scss" scoped>
:deep(.hl-placeholder) {
  color: var(--nb-c-info);
  font-weight: 600;
}

:deep(.hl-keyref) {
  color: var(--nb-c-primary);
  font-style: italic;
}

.t-editor__ac-item {
  font-family: var(--nb-font-family-mono);
  color: var(--nb-c-primary);
}
</style>
