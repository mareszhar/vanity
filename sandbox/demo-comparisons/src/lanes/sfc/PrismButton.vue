<template lang="pug">
button.button(:class="[`intent-${props.intent}`, `size-${props.size}`, { pill: props.pill }]")
  slot
</template>

<script setup lang="ts">
// Variants are class-name conventions; nothing checks that a class exists or
// that the prop union and the CSS stay in step.
import type { ButtonProps } from '@prism/domain'
import './tokens.css'

const props = withDefaults(defineProps<ButtonProps>(), { intent: 'brand', size: 'md', pill: false })
</script>

<style scoped>
.button {
  display: inline-flex;
  align-items: center;
  gap: var(--sfc-space-xs);
  padding: var(--sfc-space-sm) var(--sfc-space-md);
  border: none;
  border-radius: var(--sfc-radius-sm);
  font: 400 1rem/1.5 inherit;
  cursor: pointer;
  transition:
    background var(--sfc-duration-fast) ease,
    border-color var(--sfc-duration-fast) ease;
}

.button:focus-visible {
  outline: 2px solid var(--sfc-brand);
  outline-offset: 2px;
}

.intent-brand {
  background: var(--sfc-brand);
  color: var(--sfc-on-brand);
}

.intent-brand:hover {
  background: var(--sfc-brand-hover);
}

.intent-ghost {
  background: transparent;
  color: var(--sfc-ink);
  border: 1px solid var(--sfc-border);
}

.intent-ghost:hover {
  background: var(--sfc-brand-soft);
  border-color: var(--sfc-brand);
}

.size-sm {
  font-size: 0.875rem;
  line-height: 1.45;
  padding: var(--sfc-space-xs) var(--sfc-space-sm);
}

.pill {
  border-radius: var(--sfc-radius-pill);
}
</style>
