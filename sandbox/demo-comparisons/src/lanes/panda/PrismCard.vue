<template lang="pug">
article(:class="root")
  h3(:class="title") {{ card.title }}
  p(:class="body") {{ card.body }}
  PrismButton(size="sm" @click="emit('action')") {{ card.action }}
</template>

<script setup lang="ts">
import { card } from '@prism/domain'
import { css } from '../../../styled-system/css'
import PrismButton from './PrismButton.vue'

const emit = defineEmits<{ action: [] }>()

const root = css({
  display: 'grid',
  gap: 'sm',
  justifyItems: 'start',
  padding: 'md',
  background: 'surface',
  border: '1px solid token(colors.border)',
  borderRadius: 'md',
})

const title = css({ margin: 0, fontSize: '1.125rem', lineHeight: 1.3, fontWeight: 600, color: 'ink' })
const body = css({ margin: 0, fontSize: '0.875rem', color: 'inkMuted' })
</script>
