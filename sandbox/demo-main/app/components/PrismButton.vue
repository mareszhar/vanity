<template lang="pug">
button(:class="s.button(props)" :type="props.type" :disabled="props.disabled")
  slot
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import * as s from 'styled/PrismButton.css.ts'

// The recipe's variant space is the props declaration — one source of truth.
const props = defineProps({
  ...propsOf(s.button),
  disabled: Boolean,
  type: { type: String as PropType<'reset' | 'button' | 'submit'>, default: 'button' },
})
</script>
