<template>
  <!-- NbBreadcrumbs draws the separators between crumbs, renders every parent
       as a real link and the page you are on as text, and on a phone shows
       only that last crumb, cut with an ellipsis (collapse="phone"). -->
  <NbBreadcrumbs title="Nubisco" subtitle="Verba" collapse="phone" :items="crumbs" />
</template>

<script setup lang="ts">
import { useBreadcrumbs } from '../composables/useBreadcrumbs'

const { crumbs } = useBreadcrumbs()
</script>
