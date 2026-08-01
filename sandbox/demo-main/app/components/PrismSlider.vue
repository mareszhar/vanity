<template lang="pug">
label(:class="s.field")
  span(:class="s.header")
    span {{ label }}
    output(:class="s.value") {{ model }}{{ suffix }}
  input(
    v-model.number="model"
    :class="[s.slider, variant === 'hue' && s.hue]"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :aria-label="label"
  )
</template>

<script setup lang="ts">
import * as s from 'styled/PrismSlider.css.ts'

withDefaults(defineProps<{
  label: string
  min?: number
  max?: number
  step?: number
  suffix?: string
  variant?: 'default' | 'hue'
}>(), { min: 0, max: 100, step: 1, suffix: '', variant: 'default' })

const model = defineModel<number>({ required: true })
</script>
