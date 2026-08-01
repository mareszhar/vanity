<template lang="pug">
article(class="grid gap-2 justify-items-start p-4 bg-surface border border-edge rounded-md")
  h3(class="m-0 text-[1.125rem]/[1.3] font-semibold text-ink") {{ card.title }}
  p(class="m-0 text-sm text-ink-muted") {{ card.body }}
  PrismButton(size="sm" @click="emit('action')") {{ card.action }}
</template>

<script setup lang="ts">
import { card } from '@prism/domain'
import PrismButton from './PrismButton.vue'

const emit = defineEmits<{ action: [] }>()
</script>
