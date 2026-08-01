<template lang="pug">
main#prism-studio(
  ref="root"
  :class="s.page"
  :style="studio.rootProps.value.style"
  v-bind="studio.rootProps.value.attributes"
)
  a(:class="s.skipLink" href="#showcase") Skip to showcase
  StudioRail(@inspect="dialogOpen = true")
  div(:class="s.main")
    StudioShowcase
  PrismDialog(:open="dialogOpen" @close="dialogOpen = false")
    template(#title) One coherent system
    p One runtime owns every decision below. Each is a mutable token or an environmental axis — nothing here redefines a color or a curve.
    dl(:class="s.facts")
      div(v-for="fact in facts" :key="fact.label" :class="s.fact")
        dt(:class="s.factLabel") {{ fact.label }}
        dd(:class="s.factValue") {{ fact.value }}
    p(:class="s.note") Persisted in a cookie and projected through the SSR snapshot, so the first server paint already carries these choices — no flash on reload.
</template>

<script setup lang="ts">
import * as s from 'styled/app.css.ts'

const studio = useStudio()
provide(studioKey, studio)

// The themed studio owns component chrome, but the viewport scrollbar belongs
// to the document. Keep its native color scheme in sync from the SSR snapshot
// onward, including the dual-scheme System mode.
useHead(() => ({
  htmlAttrs: {
    style: `color-scheme: ${studio.settings.value.scheme === 'system' ? 'light dark' : studio.settings.value.scheme}`,
  },
}))

const root = useTemplateRef<HTMLElement>('root')
const dialogOpen = ref(false)

onMounted(() => studio.bind(root.value!))

const facts = computed(() => {
  const settings = studio.settings.value
  return [
    { label: 'Palette hue', value: `${settings.hue}° — mutable color token` },
    { label: 'Radius seed', value: `${settings.radius}px — mutable length token` },
    { label: 'Typeface', value: `${settings.typeface} — mutable family token` },
    { label: 'Scheme', value: `${settings.scheme} — element-local axis` },
    { label: 'Density', value: `${settings.density} — root axis` },
    { label: 'Motion', value: `${settings.motion} — root axis` },
  ]
})
</script>
