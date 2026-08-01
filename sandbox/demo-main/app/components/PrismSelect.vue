<template lang="pug">
label(:class="s.field")
  span(:class="s.label") {{ label }}
  span(:class="s.wrap")
    select(v-model="model" :class="s.select" :aria-label="label")
      option(v-for="option in options" :key="option.value" :value="option.value") {{ option.label }}
    span(:class="s.caret" aria-hidden="true") ▼
</template>

<script setup lang="ts">
import * as s from 'styled/PrismSelect.css.ts'

defineProps<{ label: string, options: { value: string, label: string }[] }>()
const model = defineModel<string>({ required: true })
</script>
