<template lang="pug">
div(:class="s.card")
  slot
</template>

<script setup lang="ts">
import * as s from './UiCard.css.ts'
</script>
