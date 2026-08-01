<template lang="pug">
button(
  :class="d.root"
  type="button"
  role="switch"
  :aria-checked="model"
  :data-state="model ? 'checked' : 'unchecked'"
  @click="model = !model"
)
  span(:class="d.track")
    span(:class="d.knob")
  span(v-if="label") {{ label }}
</template>

<script setup lang="ts">
import * as s from 'styled/PrismSwitch.css.ts'

defineProps<{ label?: string }>()
const model = defineModel<boolean>({ required: true })
const d = useAnatomy(s.control)
</script>
