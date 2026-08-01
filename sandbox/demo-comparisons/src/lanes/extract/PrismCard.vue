<template lang="pug">
article(:class="cardClass")
  h3(:class="cardTitle") {{ card.title }}
  p(:class="cardBody") {{ card.body }}
  PrismButton(size="sm" @click="emit('action')") {{ card.action }}
</template>

<script setup lang="ts">
import { card } from '@prism/domain'
import { cardBody, card as cardClass, cardTitle } from './prism.css'
import PrismButton from './PrismButton.vue'

const emit = defineEmits<{ action: [] }>()
</script>
