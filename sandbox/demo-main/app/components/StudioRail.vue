<template lang="pug">
aside(:class="s.rail" aria-label="Design system controls")
  div(:class="s.brand")
    span(:class="s.brandMark" aria-hidden="true") ◆
    div(:class="s.brandText")
      p(:class="s.brandName") Prism
      p(:class="s.brandTag") a design system · vanity

  section(:class="s.section")
    p(:class="s.heading") Live decisions
    div(:class="s.controls")
      PrismSlider(v-model="settings.hue" label="Palette hue" :min="0" :max="360" suffix="°" variant="hue")
      PrismSlider(v-model="settings.radius" label="Radius" :min="0" :max="26" suffix="px")
      div(:class="s.group")
        span(:class="s.controlLabel") Appearance
        PrismSegmented(v-model="settings.scheme" :options="schemeOptions" label="Appearance")
      div(:class="s.group")
        span(:class="s.controlLabel") Density
        PrismSegmented(v-model="settings.density" :options="densityOptions" label="Density")
      div(:class="s.group")
        span(:class="s.controlLabel") Typeface
        PrismSegmented(v-model="settings.typeface" :options="typefaceOptions" label="Typeface")
      div(:class="s.group")
        span(:class="s.controlLabel") Motion
        PrismSegmented(v-model="settings.motion" :options="motionOptions" label="Motion")

  section(:class="s.section")
    p(:class="s.heading") Preset systems
    div(:class="s.presets")
      button(
        v-for="preset in presets"
        :key="preset.name"
        :class="s.preset"
        type="button"
        @click="patch(preset.settings)"
      )
        span(:class="s.presetDot" :style="{ background: dot(preset.settings.hue) }" aria-hidden="true")
        span {{ preset.name }}

  section(:class="s.section")
    div(:class="s.actions")
      PrismButton(intent="solid" block @click="surprise") ✦ Surprise me
      PrismButton(intent="outline" block @click="reset") Reset to defaults
      PrismButton(intent="ghost" block @click="emit('inspect')") Inspect system

  footer(:class="s.footer")
    p(:class="s.note") Every control writes one custom property or axis attribute — never a duplicated value. Edit a token module and it updates live.
</template>

<script setup lang="ts">
import * as s from 'styled/StudioRail.css.ts'

const emit = defineEmits<{ inspect: [] }>()

const { settings, patch, reset, surprise } = useStudioContext()

const typefaceOptions = [
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
]
const densityOptions = [
  { value: 'compact', label: 'Compact' },
  { value: 'cozy', label: 'Cozy' },
  { value: 'spacious', label: 'Spacious' },
]
const schemeOptions = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
const motionOptions = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'springy', label: 'Springy' },
]

const dot = (hue: number) => `oklch(0.58 0.15 ${hue})`
</script>
