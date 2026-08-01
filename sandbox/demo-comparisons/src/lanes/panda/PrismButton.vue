<template lang="pug">
button(:class="classes")
  slot
</template>

<script setup lang="ts">
// Panda's cva: typed variants, but the styles must stay statically
// analyzable — the extractor, not the language, decides what's expressible —
// and the token types arrive through a codegen artifact directory.
import type { ButtonProps } from '@prism/domain'
import { cva } from '../../../styled-system/css'

const props = withDefaults(defineProps<ButtonProps>(), { intent: 'brand', size: 'md', pill: false })

const button = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'xs',
    border: 'none',
    borderRadius: 'sm',
    cursor: 'pointer',
    transition: 'background 120ms ease, border-color 120ms ease',
    _focusVisible: { outline: '2px solid token(colors.brand)', outlineOffset: '2px' },
  },
  variants: {
    intent: {
      brand: {
        background: 'brand',
        color: 'onBrand',
        _hover: { background: 'brandHover' },
      },
      ghost: {
        background: 'transparent',
        color: 'ink',
        border: '1px solid token(colors.border)',
        _hover: { background: 'brandSoft', borderColor: 'brand' },
      },
    },
    size: {
      sm: { fontSize: '0.875rem', lineHeight: 1.45, paddingBlock: 'xs', paddingInline: 'sm' },
      md: { fontSize: '1rem', lineHeight: 1.5, paddingBlock: 'sm', paddingInline: 'md' },
    },
    pill: {
      true: { borderRadius: 'pill' },
    },
  },
})

const classes = computed(() => button({ intent: props.intent, size: props.size, pill: props.pill }))
</script>
