<template>
  <div v-if="variables.length > 0 || hasPluralForms" class="translation-tester">
    <div class="tester-header">
      <span class="tester-title">Test string</span>
      <NbBadge v-if="hasPluralForms" variant="purple" size="sm">plural</NbBadge>
    </div>

    <!-- Variable inputs -->
    <div v-if="variables.length > 0" class="tester-vars">
      <div v-for="v in variables" :key="v" class="var-row">
        <span class="var-label" aria-hidden="true">
          <code>{{ '{' + v + '}' }}</code>
        </span>
        <NbTextInput
          v-model="values[v]"
          :aria-label="v"
          class="var-input"
          :type="v === 'count' || v === 'n' ? 'number' : 'text'"
          :placeholder="v"
          :min="v === 'count' || v === 'n' ? 0 : undefined"
        />
      </div>
    </div>

    <!-- Preview per locale -->
    <div class="tester-results">
      <div v-for="locale in activeLocales" :key="locale.id" class="result-row">
        <LocaleBadge :code="locale.code" />
        <span class="result-values">
          <template v-if="resolve(locale.id).length === 1">
            <span class="result-text">{{ resolve(locale.id)[0].text }}</span>
          </template>
          <template v-else>
            <span v-for="entry in resolve(locale.id)" :key="entry.form" class="result-plural-row">
              <span class="result-form">{{ entry.form }}</span>
              <span class="result-text">{{ entry.text }}</span>
            </span>
          </template>
        </span>
      </div>
    </div>
  </div>
  <div v-else>
    <NbMessage>Nothing to test yet</NbMessage>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LocaleBadge from './LocaleBadge.vue'

interface Locale {
  id: string
  code: string
}

const props = defineProps<{
  translations: Map<string, string> // localeId → raw text
  locales: Locale[]
}>()

// Extract all {variable} placeholders from all translations
const variables = computed(() => {
  const names = new Set<string>()
  for (const [, text] of props.translations) {
    if (!text) continue
    for (const m of text.matchAll(/\{(\w+)\}/g)) {
      names.add(m[1])
    }
  }
  return [...names].sort()
})

// Whether any locale uses pipe-separated plural forms
const hasPluralForms = computed(() => {
  for (const [, text] of props.translations) {
    if (text?.includes(' | ')) return true
  }
  return false
})

// User-provided values
const values = ref<Record<string, string>>({})

// Whenever new variables appear, ensure entries exist (keep existing ones)
watch(
  variables,
  (vars) => {
    for (const v of vars) {
      if (!(v in values.value)) {
        values.value[v] = v === 'count' || v === 'n' ? '1' : ''
      }
    }
  },
  { immediate: true },
)

function interpolate(raw: string, vals: Record<string, string>): string {
  return raw.replace(/\{(\w+)\}/g, (_, name) => vals[name] ?? `{${name}}`)
}

/** Returns [{ form, text }]: one entry normally, multiple for plural pipes */
function resolve(localeId: string): { form: string; text: string }[] {
  const raw = props.translations.get(localeId) ?? ''
  if (!raw) return []

  if (raw.includes(' | ')) {
    // Pipe-separated plural: zero | one | other  OR  one | other
    const parts = raw.split(' | ')
    const labels =
      parts.length === 3
        ? ['zero', 'singular', 'plural']
        : parts.length === 2
          ? ['singular', 'plural']
          : parts.map((_, i) => `form ${i + 1}`)
    return parts.map((p, i) => ({
      form: labels[i],
      text: interpolate(p.trim(), values.value),
    }))
  }

  return [{ form: '', text: interpolate(raw, values.value) }]
}

// Locale list filtered to only those that have a translation
const activeLocales = computed(() => props.locales.filter((l) => props.translations.get(l.id)))
</script>

<style scoped lang="scss">
.translation-tester {
  margin-top: 1rem;
  border: 1px solid var(--nb-c-border);
  border-radius: 8px;
  overflow: hidden;
  font-size: 13px;
}

.tester-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--nb-c-layer-2);
  border-bottom: 1px solid var(--nb-c-border);
  font-weight: 600;
  color: var(--nb-c-text-subtle);
}

.tester-vars {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid var(--nb-c-border);
}

.var-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.var-label {
  width: 100px;
  flex-shrink: 0;
  color: var(--nb-c-text-subtle);

  code {
    font-size: 12px;
    background: var(--nb-c-surface-hover);
    padding: 1px 5px;
    border-radius: 3px;
  }
}

.var-input {
  flex: 1;
  min-width: 0;
}

.tester-results {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.result-values {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.result-text {
  color: var(--nb-c-text);
  word-break: break-word;
}

.result-plural-row {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.result-form {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--nb-c-text-subtle);
  width: 50px;
  flex-shrink: 0;
}
</style>
