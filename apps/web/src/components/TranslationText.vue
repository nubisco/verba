<template>
  <span class="translation-text">
    <template v-for="(seg, i) in parse(text)" :key="i">
      <span v-if="seg.type === 'placeholder'" class="chip chip-placeholder">{{ seg.value }}</span>
      <template v-else-if="seg.type === 'keyref'">
        <template v-if="keyMap !== undefined">
          <span
            v-if="keyMap[seg.keyName!] !== undefined && keyMap[seg.keyName!] !== ''"
            class="keyref-resolved"
            :title="`Resolves to: ${keyMap[seg.keyName!]}`"
            >{{ seg.value }} (✓ {{ keyMap[seg.keyName!] }})</span
          >
          <span v-else-if="seg.keyName! in keyMap" class="keyref-warning" title="Key exists but has no translation yet"
            >{{ seg.value }} ⚠️</span
          >
          <span v-else class="keyref-error" :title="`Key '${seg.value}' not found: translation will not resolve`"
            >{{ seg.value }} ❌</span
          >
        </template>
        <span v-else class="chip chip-keyref" :title="'Key reference: ' + seg.value">{{ seg.value }}</span>
      </template>
      <span v-else>{{ seg.value }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
const { text, keyMap = {} } = defineProps<{
  text: string
  keyMap?: Record<string, string>
}>()

interface Segment {
  type: 'text' | 'placeholder' | 'keyref'
  value: string
  keyName?: string
}

function parse(text: string): Segment[] {
  const segments: Segment[] = []
  const re = /(\{[\w.]+\})|(@:([\w.]+))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: text.slice(last, m.index) })
    if (m[1]) segments.push({ type: 'placeholder', value: m[1] })
    if (m[2]) segments.push({ type: 'keyref', value: m[2], keyName: m[3] })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  return segments
}
</script>

<style lang="scss" scoped>
.chip {
  display: inline-block;
  border-radius: 4px;
  padding: 0 4px;
  font-family: var(--nb-font-family-mono);
  font-size: 0.85em;
  font-weight: 600;
}

.chip-placeholder {
  background: var(--nb-c-info-surface);
  color: var(--nb-c-on-info-surface);
  border: 1px solid var(--nb-c-info-surface-border);
}

.chip-keyref {
  background: color-mix(in srgb, var(--nb-c-primary) 12%, transparent);
  color: var(--nb-c-primary);
  border: 1px solid color-mix(in srgb, var(--nb-c-primary) 35%, transparent);
}

.keyref-resolved {
  background: var(--nb-c-success-surface);
  color: var(--nb-c-on-success-surface);
  border: 1px solid var(--nb-c-success-surface-border);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 0.85em;
  font-family: var(--nb-font-family-mono);
  cursor: help;
}

.keyref-warning {
  background: var(--nb-c-warning-surface);
  color: var(--nb-c-on-warning-surface);
  border: 1px solid var(--nb-c-warning-surface-border);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 0.85em;
  font-family: var(--nb-font-family-mono);
  cursor: help;
}

.keyref-error {
  background: var(--nb-c-danger-surface);
  color: var(--nb-c-on-danger-surface);
  border: 1px solid var(--nb-c-danger-surface-border);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 0.85em;
  font-family: var(--nb-font-family-mono);
  cursor: help;
  text-decoration: underline wavy var(--nb-c-status-error);
}
</style>
