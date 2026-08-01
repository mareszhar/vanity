<template lang="pug">
div(
  :class="s.track"
  role="progressbar"
  :aria-valuenow="Math.round(value)"
  aria-valuemin="0"
  :aria-valuemax="max"
)
  div(:class="s.fill" :style="fillStyle")
</template>

<script setup lang="ts">
import * as s from 'styled/PrismProgress.css.ts'

const props = withDefaults(defineProps<{ value: number, max?: number }>(), { max: 100 })

// One port, one binding — Vue's `v-bind()` mental model, typed.
const fillStyle = usePorts(() => [s.fraction.dec(props.value / props.max)])
</script>
