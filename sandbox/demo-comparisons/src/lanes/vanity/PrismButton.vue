<template lang="pug">
button(:class="s.button(props)")
  slot
</template>

<script setup lang="ts">
// One source of truth: the recipe's variant space *is* the props declaration.
import * as s from './button.css.ts'

const props = defineProps(propsOf(s.button))
</script>
