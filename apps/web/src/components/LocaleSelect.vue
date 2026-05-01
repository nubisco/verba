<script setup lang="ts">
import { computed } from 'vue'
import { type NbSelectOption } from '@nubisco/ui'
import { localeFlag } from '../utils/localeUtils'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: Array<{ code: string; name: string; id?: string }>
    placeholder?: string
    clearable?: boolean
    clearLabel?: string
    valueField?: 'code' | 'id'
  }>(),
  {
    placeholder: 'Select language…',
    clearable: false,
    clearLabel: 'All',
    valueField: 'code',
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const selectOptions = computed<NbSelectOption[]>(() => {
  const items: NbSelectOption[] = props.options.map((opt) => ({
    label: `${localeFlag(opt.code)} ${opt.code}: ${opt.name}`,
    value: props.valueField === 'id' ? opt.id! : opt.code,
  }))
  if (props.clearable) {
    items.unshift({ label: props.clearLabel, value: '' })
  }
  return items
})
</script>

<template>
  <NbSelect
    :model-value="modelValue"
    :options="selectOptions"
    :placeholder="placeholder"
    @update:model-value="emit('update:modelValue', $event as string)"
  />
</template>
