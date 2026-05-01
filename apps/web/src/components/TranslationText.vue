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

<style lang="scss" scoped>
.chip {
  display: inline-block;
  border-radius: 4px;
  padding: 0 4px;
  font-family: monospace;
  font-size: 0.85em;
  font-weight: 600;
}

.chip-placeholder {
  background: #dbeafe;
  color: #1d4ed8;
  border: 1px solid #93c5fd;
}

.chip-keyref {
  background: #ede9fe;
  color: #6d28d9;
  border: 1px solid #c4b5fd;
}

.keyref-resolved {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #6ee7b7;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 0.85em;
  font-family: monospace;
  cursor: help;
}

.keyref-warning {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 0.85em;
  font-family: monospace;
  cursor: help;
}

.keyref-error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 0.85em;
  font-family: monospace;
  cursor: help;
  text-decoration: underline wavy #ef4444;
}
</style>
