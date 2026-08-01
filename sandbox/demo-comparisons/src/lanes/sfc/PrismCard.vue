<template lang="pug">
article.card
  h3 {{ card.title }}
  p {{ card.body }}
  PrismButton(size="sm" @click="emit('action')") {{ card.action }}
</template>

<script setup lang="ts">
import { card } from '@prism/domain'
import PrismButton from './PrismButton.vue'

const emit = defineEmits<{ action: [] }>()
</script>

<style scoped>
.card {
  display: grid;
  gap: var(--sfc-space-sm);
  justify-items: start;
  padding: var(--sfc-space-md);
  background: var(--sfc-surface);
  border: 1px solid var(--sfc-border);
  border-radius: var(--sfc-radius-md);
}

.card h3 {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.3;
  font-weight: 600;
  color: var(--sfc-ink);
}

.card p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--sfc-ink-muted);
}
</style>
