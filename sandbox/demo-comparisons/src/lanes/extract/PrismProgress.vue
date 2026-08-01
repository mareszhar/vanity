<template lang="pug">
div(:class="track" role="progressbar" :aria-valuenow="props.value")
  div(:class="fill" :style="fillStyle")
</template>

<script setup lang="ts">
// The var + assignInlineVars plumbing, rebuilt per component — the shape
// vanity collapses into port() + usePorts.
import { assignInlineVars } from '@vanilla-extract/dynamic'
import { fill, fillFraction, track } from './prism.css'

const props = defineProps<{ value: number }>()

const fillStyle = computed(() => assignInlineVars({ [fillFraction]: String(props.value / 100) }))
</script>
