<template lang="pug">
div.track(role="progressbar" :aria-valuenow="props.value")
  div.fill
</template>

<script setup lang="ts">
// `v-bind()` in CSS — the SFC model's reactive-value feature: stringly,
// SFC-only, invisible to rename and find-references.
const props = defineProps<{ value: number }>()
const width = computed(() => `${props.value}%`)
</script>

<style scoped>
.track {
  background: var(--sfc-surface);
  block-size: var(--sfc-space-sm);
  border-radius: var(--sfc-radius-pill);
  overflow: hidden;
}

.fill {
  inline-size: v-bind(width);
  block-size: 100%;
  background: var(--sfc-brand);
  transition: inline-size 200ms ease;
}
</style>
