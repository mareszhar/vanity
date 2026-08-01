<template lang="pug">
main.shell
  header.hero
    p.eyebrow Prism · controlled comparison
    h1 One card. Five styling models.
    p.lede Identical components, identical features — variants, a live value, a scheme switch, and a live palette hue. Only the authoring model differs, so the source is the comparison.

  section.panel(aria-labelledby="controls-title")
    .panel-head
      div
        p.kicker Shared state
        h2#controls-title Every lane receives these
      p.status(aria-live="polite") {{ lastInteraction }} · {{ totalInteractions }} total

    .controls
      label.field
        span.field-label Intent
        .select-wrap
          select(v-model="intent")
            option(v-for="option in buttonIntents" :key="option" :value="option") {{ option }}
          span.select-caret(aria-hidden="true") ▼

      label.field
        span.field-label Size
        .select-wrap
          select(v-model="size")
            option(v-for="option in buttonSizes" :key="option" :value="option") {{ option }}
          span.select-caret(aria-hidden="true") ▼

      label.field
        span.field-label Scheme
        .select-wrap
          select(v-model="scheme")
            option(value="auto") auto
            option(value="light") light
            option(value="dark") dark
          span.select-caret(aria-hidden="true") ▼

      .field
        span.field-label Pill
        button.switch(
          type="button"
          role="switch"
          :aria-checked="pill"
          :data-state="pill ? 'checked' : 'unchecked'"
          @click="pill = !pill"
        )
          span.switch-track
            span.switch-knob

      label.field.field-wide
        span.field-label
          span Dispersion
          output.field-value {{ value }}%
        input.range(v-model.number="value" type="range" min="0" max="100" aria-label="Dispersion")

      label.field.field-wide
        span.field-label
          span Brand hue
          output.field-value {{ brandHue }}°
        input.range.range-hue(v-model.number="brandHue" type="range" min="0" max="360" aria-label="Brand hue")

    p.panel-note Each lane declares its own tokens against the same live hue channel and updates them in its own idiom — a raw #[code setProperty] for four of them, a typed token setter for vanity. Same capability everywhere; the difference is what it costs to express.

  section.matrix(aria-label="Styling model comparison")
    article.lane(
      v-for="lane in lanes"
      :key="lane.id"
      :ref="element => setLaneElement(lane.id, element)"
      :data-lane="lane.id"
      :data-scheme="scheme === 'auto' ? undefined : scheme"
    )
      header.lane-head
        span.lane-index {{ lane.index }}
        h2 {{ lane.name }}
      p.lane-note {{ lane.note }}

      .lane-demo
        .demo-block
          span.demo-label Action
          component(
            :is="lane.button"
            :intent="intent"
            :size="size"
            :pill="pill"
            @click="interact(lane.id, 'button')"
          )
            | {{ interactions[lane.id] ? `Dispatched ${interactions[lane.id]}×` : 'Dispatch' }}

        .demo-block.card-block
          span.demo-label Surface
          component(:is="lane.card" @action="interact(lane.id, 'card')")

        .demo-block
          .demo-label-row
            span.demo-label Dispersion
            span.demo-value {{ value }}%
          component(:is="lane.progress" :value="value")

      footer.lane-footer {{ interactions[lane.id] ?? 0 }} interactions received
</template>

<script setup lang="ts">
import type { ButtonIntent, ButtonSize } from '@prism/domain'
import { buttonIntents, buttonSizes, progress } from '@prism/domain'
import ExtractButton from './lanes/extract/PrismButton.vue'
import ExtractCard from './lanes/extract/PrismCard.vue'
import ExtractProgress from './lanes/extract/PrismProgress.vue'
import PandaButton from './lanes/panda/PrismButton.vue'
import PandaCard from './lanes/panda/PrismCard.vue'
import PandaProgress from './lanes/panda/PrismProgress.vue'
import SfcButton from './lanes/sfc/PrismButton.vue'
import SfcCard from './lanes/sfc/PrismCard.vue'
import SfcProgress from './lanes/sfc/PrismProgress.vue'
import TailwindButton from './lanes/tailwind/PrismButton.vue'
import TailwindCard from './lanes/tailwind/PrismCard.vue'
import TailwindProgress from './lanes/tailwind/PrismProgress.vue'
import VanityButton from './lanes/vanity/PrismButton.vue'
import VanityCard from './lanes/vanity/PrismCard.vue'
import VanityProgress from './lanes/vanity/PrismProgress.vue'
import { ds } from './lanes/vanity/system'

const intent = ref<ButtonIntent>('brand')
const size = ref<ButtonSize>('md')
const pill = ref(false)
const value = ref(progress.initial)
const scheme = ref<'auto' | 'light' | 'dark'>('auto')
const brandHue = ref(285)
const vanityLane = ref<HTMLElement>()
let vanityRuntime: ReturnType<typeof ds.runtime> | undefined
const interactions = reactive<Record<string, number>>({})
const lastInteraction = ref('No interactions yet')

watchEffect(() => {
  if (scheme.value === 'auto')
    document.documentElement.removeAttribute('data-scheme')
  else
    document.documentElement.setAttribute('data-scheme', scheme.value)

  // Four lanes read this raw channel: each declared its own derivations against
  // it, so one untyped write re-themes them all.
  document.documentElement.style.setProperty('--demo-hue', String(brandHue.value))
})

watchEffect(() => {
  if (!vanityLane.value)
    return

  // vanity owns the same channel as a typed token with a validated setter.
  vanityRuntime ??= ds.runtime({ within: vanityLane.value })
  vanityRuntime.t.color.hue.$set(brandHue.value)
})

function setLaneElement(id: string, element: Element | ComponentPublicInstance | null) {
  if (id === 'vanity' && element instanceof HTMLElement)
    vanityLane.value = element
}

function interact(id: string, source: 'button' | 'card') {
  interactions[id] = (interactions[id] ?? 0) + 1
  lastInteraction.value = `${laneName(id)} ${source} responded`
}

function laneName(id: string): string {
  return lanes.find(lane => lane.id === id)?.name ?? id
}

const totalInteractions = computed(() => Object.values(interactions).reduce((total, count) => total + count, 0))

const lanes = [
  {
    id: 'sfc',
    index: '01',
    name: 'SFC scoped CSS',
    note: 'Hand-written custom properties and class-name variants; v-bind() carries the live value.',
    button: markRaw(SfcButton),
    card: markRaw(SfcCard),
    progress: markRaw(SfcProgress),
  },
  {
    id: 'tailwind',
    index: '02',
    name: 'Tailwind',
    note: '@theme values plus a utility map per finite variant; an inline style carries the live value.',
    button: markRaw(TailwindButton),
    card: markRaw(TailwindCard),
    progress: markRaw(TailwindProgress),
  },
  {
    id: 'panda',
    index: '03',
    name: 'Panda',
    note: 'A config file and a codegen step feed cva and the generated property functions.',
    button: markRaw(PandaButton),
    card: markRaw(PandaCard),
    progress: markRaw(PandaProgress),
  },
  {
    id: 'extract',
    index: '04',
    name: 'vanilla-extract',
    note: 'Typed rules over a string token bag; no derivations, and createVar plumbing per value.',
    button: markRaw(ExtractButton),
    card: markRaw(ExtractCard),
    progress: markRaw(ExtractProgress),
  },
  {
    id: 'vanity',
    index: '05',
    name: 'vanity',
    note: 'One seed with explicit graph edges; elevation, mix, and legibleOn derive the rest.',
    button: markRaw(VanityButton),
    card: markRaw(VanityCard),
    progress: markRaw(VanityProgress),
  },
] as const
</script>
