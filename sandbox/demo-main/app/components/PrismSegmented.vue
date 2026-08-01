<template lang="pug">
div(:class="s.group" role="radiogroup" :aria-label="label")
  button(
    v-for="option in options"
    :key="option.value"
    :class="s.option"
    type="button"
    role="radio"
    :aria-checked="option.value === model"
    :data-selected="option.value === model ? '' : undefined"
    @click="model = option.value"
  )
    span(v-if="option.icon" aria-hidden="true") {{ option.icon }}
    span {{ option.label }}
</template>

<script setup lang="ts">
import * as s from 'styled/PrismSegmented.css.ts'

interface Option { value: string, label: string, icon?: string }

defineProps<{ options: Option[], label: string }>()
const model = defineModel<string>({ required: true })
</script>
