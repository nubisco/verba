<template>
  <!-- The one terms checkbox: on the sign-up step and on the page that asks
       again when the terms change. The links open in a new tab, so ticking
       the box never loses the code someone just typed. -->
  <NbCheckbox :model-value="modelValue" class="terms-consent" @update:model-value="emit('update:modelValue', $event)">
    <span class="terms-consent__label">
      I accept the
      <a v-if="terms.termsUrl" :href="terms.termsUrl" target="_blank" rel="noopener">terms of service</a>
      <template v-else>terms of service</template>
      and the
      <a v-if="terms.privacyUrl" :href="terms.privacyUrl" target="_blank" rel="noopener">privacy notice</a>
      <template v-else>privacy notice</template>.
    </span>
  </NbCheckbox>
</template>

<script setup lang="ts">
import type { TermsConfig } from '../stores/instanceConfig'

defineProps<{ terms: TermsConfig; modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<style scoped lang="scss">
.terms-consent__label {
  color: var(--nb-c-text);
  font-size: var(--nb-type-body-sm-size);
  line-height: 1.4;

  a {
    color: var(--nb-c-primary);
  }
}
</style>
