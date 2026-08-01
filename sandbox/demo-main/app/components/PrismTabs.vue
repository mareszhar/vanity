<template lang="pug">
div(:class="d.root")
  div(:class="d.list" role="tablist" :aria-label="label")
    button(
      v-for="(item, index) in items"
      :key="item.label"
      :id="`${id}-tab-${index}`"
      :class="d.trigger"
      type="button"
      role="tab"
      :data-selected="index === active ? '' : undefined"
      :aria-selected="index === active"
      :aria-controls="`${id}-panel`"
      :tabindex="index === active ? 0 : -1"
      @click="active = index"
      @keydown="onKeydown"
    ) {{ item.label }}
  p(
    :id="`${id}-panel`"
    :class="d.panel"
    role="tabpanel"
    :aria-labelledby="`${id}-tab-${active}`"
  ) {{ items[active]?.content }}
</template>

<script setup lang="ts">
import * as s from 'styled/PrismTabs.css.ts'

const props = withDefaults(defineProps<{
  items: { label: string, content: string }[]
  label?: string
}>(), { label: 'Variants' })

const active = ref(0)
const d = useAnatomy(s.tabs)
const id = `prism-tabs-${useId()}`

function focusTab(index: number): void {
  const count = props.items.length
  active.value = (index + count) % count
  document.getElementById(`${id}-tab-${active.value}`)?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  const keys: Record<string, number> = {
    ArrowRight: active.value + 1,
    ArrowLeft: active.value - 1,
    Home: 0,
    End: props.items.length - 1,
  }
  if (!(event.key in keys))
    return
  event.preventDefault()
  focusTab(keys[event.key]!)
}
</script>
