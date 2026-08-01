<template lang="pug">
div(:class="track" role="progressbar" :aria-valuenow="props.value")
  div(:class="fill" :style="fillStyle")
</template>

<script setup lang="ts">
// The reactive width can't cross Panda's static extraction, so it rides an
// inline style beside the extracted classes.
import { css } from '../../../styled-system/css'

const props = defineProps<{ value: number }>()

const track = css({
  background: 'surface',
  blockSize: '8px',
  borderRadius: 'pill',
  overflow: 'hidden',
})

const fill = css({
  blockSize: '100%',
  background: 'brand',
  transition: 'inline-size 200ms ease',
})

const fillStyle = computed(() => ({ inlineSize: `${props.value}%` }))
</script>
