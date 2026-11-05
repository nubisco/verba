<template>
  <!-- NbBreadcrumbs draws the separators between crumbs, renders every parent
       as a real link and the page you are on as text, and on a phone shows
       only that last crumb, cut with an ellipsis (collapse="phone"). A crumb
       that names one of several (the project, the account on its Settings)
       switches to another (utils/trail.ts).

       The product's name leads the trail only while the rail is collapsed,
       when the brand is out of sight (fleet standard, "The trail names the
       page, so the page does not repeat it"). -->
  <NbBreadcrumbs :title="railCollapsed ? 'Verba' : undefined" collapse="phone" :items="crumbs" />
</template>

<script setup lang="ts">
import { useBreadcrumbs } from '../composables/useBreadcrumbs'

defineProps<{ railCollapsed?: boolean }>()

const { crumbs } = useBreadcrumbs()
</script>
