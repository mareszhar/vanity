<template lang="pug">
span(:class="s.badge(props)")
  slot
</template>

<script setup lang="ts">
import * as s from 'styled/PrismBadge.css.ts'

const props = defineProps({ ...propsOf(s.badge) })
</script>
