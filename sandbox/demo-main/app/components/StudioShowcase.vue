<template lang="pug">
div#showcase(:class="s.container")
  //- ── Hero ──────────────────────────────────────────────────────────────
  header(:class="s.hero")
    p(:class="s.eyebrow") one hue · one system
    h1(:class="s.heroTitle")
      | A living #[span(:class="s.heroSerif") design system.]
    p(:class="s.lead") Color, type, spacing, elevation, motion — every decision derives from the controls at the left, driven by one TypeScript design system through ordinary, inspectable CSS.
    div(:class="s.chips")
      span(v-for="chip in configChips" :key="chip.key" :class="s.chip")
        span(:class="s.chipKey") {{ chip.key }}
        span {{ chip.value }}

  //- ── Palette ───────────────────────────────────────────────────────────
  section(:class="s.section")
    div(:class="s.head")
      p(:class="s.eyebrow") Palette
      h2(:class="s.title") Every surface is the seed, lifted
      p(:class="s.desc") Neutrals are the brand hue run through an elevation curve, so both schemes and every surface fall out of one token — and re-tint the instant you move the hue.
    div(:class="s.paletteGrid")
      div(:class="s.brandCard")
        p(:class="s.brandGlyph") Aa
        div(:class="s.brandMeta")
          p(:class="s.brandRole") Brand · legible foreground
          p(:class="s.brandCode") oklch(0.58 0.15 var(--hue))
      div(:class="s.ramp")
        div(:class="s.rampRow")
          div(v-for="tone in surfaces" :key="tone.name" :class="s.swatchItem")
            div(:class="s.swatch" :style="{ background: tone.bg }")
            span(:class="s.swatchName") {{ tone.name }}
        div(:class="s.rampRow")
          div(v-for="tone in statuses" :key="tone.name" :class="s.swatchItem")
            div(:class="s.swatch" :style="{ background: tone.bg }")
            span(:class="s.swatchName") {{ tone.name }}

  //- ── Typography ────────────────────────────────────────────────────────
  section(:class="s.section")
    div(:class="s.head")
      p(:class="s.eyebrow") Typography
      h2(:class="s.title") One scale, three voices
      p(:class="s.desc") The typeface control swaps a mutable family token; the scale, weights, and rhythm hold. Sizes stay in rem so browser zoom keeps working.
    div(:class="s.typeList")
      div(v-for="row in typeScale" :key="row.key" :class="s.typeRow")
        span(:class="s.typeMeta") {{ row.meta }}
        p(:class="[s.typeSample, s.samples[row.key]]") {{ row.sample }}
      pre(:class="s.codeSample")
        code const brand = oklch(0.58, 0.15, hue) // one seed

  //- ── Components ────────────────────────────────────────────────────────
  section(:class="s.section")
    div(:class="s.head")
      p(:class="s.eyebrow") Components
      h2(:class="s.title") Recipes, ports, and headless state
      p(:class="s.desc") Variants compile to precomputed classes; runtime values cross through typed ports; keyboard, focus, and data-state are first-class.
    div(:class="s.gallery")
      div(:class="s.panel")
        p(:class="s.panelTitle") Buttons — intent × size
        div(:class="s.row")
          PrismButton(intent="solid") Solid
          PrismButton(intent="soft") Soft
          PrismButton(intent="outline") Outline
          PrismButton(intent="ghost") Ghost
        div(:class="s.row")
          PrismButton(size="sm") Small
          PrismButton(size="md") Medium
          PrismButton(size="lg") Large
        div(:class="s.row")
          PrismButton(intent="solid" pill) Pill
          PrismButton(intent="outline" disabled) Disabled

      div(:class="s.panel")
        p(:class="s.panelTitle") Inputs
        div(:class="s.stackY")
          PrismField(v-model="email" label="Work email" type="email" placeholder="you@studio.dev")
          PrismSelect(v-model="plan" label="Plan" :options="planOptions")
          PrismSwitch(v-model="notify" label="Product updates")
          PrismSwitch(v-model="beta" label="Early access")

      div(:class="s.panel")
        p(:class="s.panelTitle") Status
        div(:class="s.row")
          PrismBadge(tone="brand") Brand
          PrismBadge(tone="neutral") Neutral
          PrismBadge(tone="positive") Shipped
          PrismBadge(tone="warning") Review
          PrismBadge(tone="danger") Blocked
        div(:class="s.meterRow")
          PrismProgress(:value="progress")
          div(:class="s.row")
            PrismButton(intent="soft" size="sm" @click="bump") Advance
            span(:class="s.specimenHint") {{ progress }}% — one port, static stylesheet

      div(:class="s.panel")
        p(:class="s.panelTitle") Tabs — a component's variants
        PrismTabs(:items="tabItems" label="Button intent")

  //- ── Elevation ─────────────────────────────────────────────────────────
  section(:class="s.section")
    div(:class="s.head")
      p(:class="s.eyebrow") Elevation & shadows
      h2(:class="s.title") Depth from axes, not a lookup table
      p(:class="s.desc") Shadows are layered stacks that lift with spacious density and flatten to nothing in the dark. Switch the scheme or density at the left to watch them respond.
    div(:class="s.surfaces")
      article(v-for="plane in planes" :key="plane.name" :class="s.surfaceCard" :style="{ background: plane.bg, boxShadow: plane.shadow }")
        p(:class="s.surfaceName") {{ plane.name }}
        p(:class="s.surfaceNote") {{ plane.note }}

  //- ── Responsive / container query ──────────────────────────────────────
  section(:class="s.section")
    div(:class="s.head")
      p(:class="s.eyebrow") Responsive
      h2(:class="s.title") Container queries, not just breakpoints
      p(:class="s.desc") Drag the handle at the corner. The specimen reorganizes on its own width, independent of the viewport — the same primitive that lets a component be responsive anywhere it lands.
    div(:class="s.resizer" data-capability="container-query")
      div(:class="s.specimen" data-capability="container-specimen")
        div(:class="s.specimenArt" aria-hidden="true") ◑
        div(:class="s.specimenBody")
          p(:class="s.samples.label") Adaptive specimen
          p(:class="s.samples.detail") Below its container breakpoint this stacks; above it, the art and copy sit side by side.
        div(:class="s.specimenActions")
          PrismButton(size="sm") Primary
          PrismButton(intent="outline" size="sm") Secondary
    p(:class="s.specimenHint") ↔ resize me

  //- ── Motion ────────────────────────────────────────────────────────────
  section(:class="s.section")
    div(:class="s.head")
      p(:class="s.eyebrow") Motion
      h2(:class="s.title") Profiles you can feel
      p(:class="s.desc") None, subtle, and springy retune the same durations and easings. Replay the load under each — and reduced-motion always wins over all of them.
    div(:class="s.card")
      div(:key="replay" :class="s.chart" role="img" aria-label="Bar chart replaying its entrance animation")
        span(v-for="(value, index) in bars" :key="index" :class="s.bar" :style="{ blockSize: `${value}%`, animationDelay: `${index * 40}ms` }")
      div(:class="s.row")
        PrismButton(intent="soft" size="sm" @click="replay++") Replay animation

  //- ── Inspector ─────────────────────────────────────────────────────────
  section(:class="s.section")
    div(:class="s.head")
      p(:class="s.eyebrow") Provenance
      h2(:class="s.title") Why does it look this way?
      p(:class="s.desc") Each answer comes from #[code ds.explain()] at build time — the semantic path, data type, and emitted custom property, with private runtime slots kept private.
    div(:class="s.provenance" data-capability="explanation")
      article(v-for="fact in facts" :key="fact.path" :class="[s.factCard, s.reveal]")
        div(:class="s.factHead")
          span(:class="s.factRole") {{ fact.role }}
          code(:class="s.factType") &lt;{{ fact.type }}&gt;
        p(:class="s.factPath") {{ fact.path }}
        code(:class="s.factVar") var({{ fact.name }})
        p(:class="s.factNote") {{ fact.note }}
</template>

<script setup lang="ts">
import * as s from 'styled/StudioShowcase.css.ts'

const { settings } = useStudioContext()
const facts = s.facts

const configChips = computed(() => {
  const v = settings.value
  return [
    { key: 'hue', value: `${v.hue}°` },
    { key: 'radius', value: `${v.radius}px` },
    { key: 'appearance', value: v.scheme },
    { key: 'density', value: v.density },
    { key: 'motion', value: v.motion },
    { key: 'type', value: v.typeface },
  ]
})

const c = ds.t.color
const surfaces = [
  { name: 'canvas', bg: c.canvas.$var() },
  { name: 'surface', bg: c.surface.$var() },
  { name: 'raised', bg: c.raised.$var() },
  { name: 'overlay', bg: c.overlay.$var() },
  { name: 'border', bg: c.border.$var() },
  { name: 'ink muted', bg: c.inkMuted.$var() },
  { name: 'ink', bg: c.ink.$var() },
]
const statuses = [
  { name: 'brand', bg: c.brand.$var() },
  { name: 'positive', bg: c.positive.$var() },
  { name: 'warning', bg: c.warning.$var() },
  { name: 'danger', bg: c.danger.$var() },
]

const planes = [
  { name: 'Surface', bg: c.surface.$var(), shadow: ds.t.shadow.raised.$var(), note: 'shadow.raised' },
  { name: 'Raised', bg: c.raised.$var(), shadow: ds.t.shadow.raised.$var(), note: 'lifts with density' },
  { name: 'Overlay', bg: c.overlay.$var(), shadow: ds.t.shadow.panel.$var(), note: 'shadow.panel' },
]

const typeScale = [
  { key: 'display' as const, meta: 'Display · 3rem / 700', sample: 'Design at the speed of thought' },
  { key: 'heading' as const, meta: 'Heading · 1.9rem / 680', sample: 'A coherent system' },
  { key: 'title' as const, meta: 'Title · 1.35rem / 640', sample: 'Every decision has provenance' },
  { key: 'lead' as const, meta: 'Lead · 1.1rem / 400', sample: 'The floor is CSS; the ceiling is TypeScript.' },
  { key: 'body' as const, meta: 'Body · 0.95rem / 400', sample: 'Ordinary, inspectable CSS you could keep if the tool vanished.' },
  { key: 'label' as const, meta: 'Label · 0.85rem / 550', sample: 'Controls, fields, and navigation' },
  { key: 'detail' as const, meta: 'Detail · 0.78rem / 500', sample: 'Captions, metadata, and hints' },
  { key: 'micro' as const, meta: 'Micro · 0.72rem / 500', sample: 'FINE PRINT AND OVERLINES' },
]

const planOptions = [
  { value: 'starter', label: 'Starter' },
  { value: 'studio', label: 'Studio' },
  { value: 'scale', label: 'Scale' },
]
const tabItems = [
  { label: 'Solid', content: 'The default action — brand fill, legible foreground, and a soft shadow that flattens in the dark.' },
  { label: 'Soft', content: 'A tinted surface for secondary emphasis: brand color on a translucent brand wash.' },
  { label: 'Outline', content: 'A quiet bordered action that brightens to the brand on hover.' },
  { label: 'Ghost', content: 'Chromeless until interacted with — for dense toolbars and menus.' },
]

const email = ref('')
const plan = ref('studio')
const notify = ref(true)
const beta = ref(false)
const progress = ref(64)
const replay = ref(0)
const bars = [38, 52, 46, 64, 58, 76, 70, 85, 79, 92, 88, 100]

function bump(): void {
  progress.value = progress.value >= 100 ? 24 : progress.value + 12
}
</script>
