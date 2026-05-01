<template>
  <span class="locale-badge-wrap">
    <NbFlag :name="localeToFlagName(code)" :size="size" />
    <span v-if="showCode" class="locale-badge-code">{{ code }}</span>
  </span>
</template>

<script setup lang="ts">
import { localeToFlagName } from '../utils/localeUtils'

withDefaults(
  defineProps<{
    code: string
    size?: number
    showCode?: boolean
  }>(),
  {
    size: 16,
    showCode: true,
  },
)
</script>

<style lang="scss" scoped>
.locale-badge-wrap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: #4f46e5;
  white-space: nowrap;
}

.locale-badge-code {
  line-height: 1;
}
</style>
