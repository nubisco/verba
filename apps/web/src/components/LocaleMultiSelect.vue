<script setup lang="ts">
import { computed } from 'vue'
import { type NbSelectOption } from '@nubisco/ui'
import { localeFlag } from '../utils/localeUtils'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    options: Array<{ code: string; name: string; id: string }>
    valueField?: 'code' | 'id'
  }>(),
  {
    valueField: 'id',
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const selectOptions = computed<NbSelectOption[]>(() =>
  props.options.map((opt) => ({
    label: `${localeFlag(opt.code)} ${opt.code}: ${opt.name}`,
    value: props.valueField === 'code' ? opt.code : opt.id,
  })),
)
</script>

<template>
  <NbSelect
    :model-value="modelValue"
    :options="selectOptions"
    :multiple="true"
    @update:model-value="emit('update:modelValue', $event as string[])"
  />
</template>
