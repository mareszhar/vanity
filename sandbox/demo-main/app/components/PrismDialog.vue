<template lang="pug">
//- Rendered in place: the palette is rooted at #prism-studio, so the dialog
//- stays inside it rather than teleporting past its token declarations.
template(v-if="open")
  div(:class="d.backdrop" :data-state="state" @click="emit('close')")
  div(:class="d.positioner" :data-state="state")
    div(
      ref="content"
      :class="d.content"
      :data-state="state"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      @keydown.esc="emit('close')"
    )
      div(:class="d.header")
        h2(:id="titleId" :class="d.title")
          slot(name="title")
        button(:class="d.close" type="button" aria-label="Close" @click="emit('close')") ✕
      div(:class="d.body")
        slot
      div(v-if="$slots.footer" :class="d.footer")
        slot(name="footer")
</template>

<script setup lang="ts">
import * as s from 'styled/PrismDialog.css.ts'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const d = useAnatomy(s.dialog)
const state = computed(() => (props.open ? 'open' : 'closed'))
const content = ref<HTMLElement>()
const titleId = `prism-dialog-${useId()}`
let restoreFocus: HTMLElement | undefined

watch(() => props.open, async (open) => {
  if (open) {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    await nextTick()
    content.value?.focus()
  }
  else {
    restoreFocus?.focus()
    restoreFocus = undefined
  }
})

onBeforeUnmount(() => restoreFocus?.focus())
</script>
