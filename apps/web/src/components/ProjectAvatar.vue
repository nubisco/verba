<template>
  <div :class="['project-avatar', `project-avatar--${size}`]">
    <img v-if="isLogo" :src="avatar!" class="project-avatar__img" alt="" />
    <span v-else class="project-avatar__text">{{ displayText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    avatar?: string | null
    name: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
  }>(),
  { size: 'md' },
)

const isLogo = computed(() => !!props.avatar?.startsWith('data:image/'))

const displayText = computed(() => {
  if (props.avatar && !isLogo.value) return props.avatar
  return props.name.trim().slice(0, 2).toUpperCase()
})
</script>

<style scoped lang="scss">
.project-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(124, 58, 237, 0.15);
  overflow: hidden;
  flex-shrink: 0;

  &--sm {
    width: 24px;
    height: 24px;
  }
  &--md {
    width: 32px;
    height: 32px;
  }
  &--lg {
    width: 40px;
    height: 40px;
  }
  &--xl {
    width: 56px;
    height: 56px;
  }

  &__text {
    font-family: var(--nb-font-family-sans, sans-serif);
    font-weight: 700;
    color: rgba(167, 139, 250, 1);
    letter-spacing: 0.03em;
    line-height: 1;

    .project-avatar--sm & {
      font-size: 10px;
    }
    .project-avatar--md & {
      font-size: 12px;
    }
    .project-avatar--lg & {
      font-size: 15px;
    }
    .project-avatar--xl & {
      font-size: 20px;
    }
  }

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
