<template lang="pug">
button(:class="classes")
  slot
</template>

<script setup lang="ts">
// Variants are string maps over utility soup. The maps type-check against the
// prop union, but every class inside them is an unchecked string — a typo'd
// utility silently styles nothing.
import type { ButtonProps } from '@prism/domain'

const props = withDefaults(defineProps<ButtonProps>(), { intent: 'brand', size: 'md', pill: false })

const intents = {
  brand: 'bg-brand text-on-brand hover:bg-brand-hover',
  ghost: 'bg-transparent text-ink border border-edge hover:bg-brand-soft hover:border-brand',
}

const sizes = {
  sm: 'text-sm/[1.45] px-2 py-1',
  md: 'text-base/normal px-4 py-2',
}

const classes = computed(() => [
  'inline-flex items-center gap-1 cursor-pointer transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2',
  intents[props.intent],
  sizes[props.size],
  // Conflicting utilities don't merge — source order in the generated sheet
  // decides — so the corner radius must be chosen, not overridden.
  props.pill ? 'rounded-full' : 'rounded-sm',
])
</script>
