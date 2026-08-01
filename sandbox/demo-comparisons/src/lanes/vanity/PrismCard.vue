<template lang="pug">
article(:class="s.root")
  h3(:class="s.title") {{ card.title }}
  p(:class="s.body") {{ card.body }}
  PrismButton(size="sm" @click="emit('action')") {{ card.action }}
</template>

<script setup lang="ts">
import { card } from '@prism/domain'
import * as s from './card.css.ts'
import PrismButton from './PrismButton.vue'

const emit = defineEmits<{ action: [] }>()
</script>
