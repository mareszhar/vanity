<template lang="pug">
label(:class="s.field")
  span(:class="s.label") {{ label }}
  input(
    v-model="model"
    :class="s.input"
    :type="type"
    :placeholder="placeholder"
    :inputmode="inputmode"
  )
</template>

<script setup lang="ts">
import * as s from 'styled/PrismField.css.ts'

withDefaults(defineProps<{
  label: string
  type?: string
  placeholder?: string
  inputmode?: 'text' | 'email' | 'numeric' | 'tel' | 'url' | 'search' | 'decimal' | 'none'
}>(), { type: 'text', placeholder: '', inputmode: 'text' })

const model = defineModel<string>({ default: '' })
</script>
