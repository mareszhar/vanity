import { open } from './open'

/** One rem length that retunes across the density axis without per-token edits. */
function density(cozy: number, compact: number, spacious: number) {
  return open.tdef.length({
    val: open.length.rem(cozy),
    axes: { density: { compact: open.length.rem(compact), spacious: open.length.rem(spacious) } },
  })
}

function text(fontSize: number, lineHeight: number, fontWeight: number, letterSpacing = '0') {
  return {
    fontSize: open.length.rem(fontSize),
    lineHeight,
    fontWeight,
    letterSpacing,
  }
}

/** Spacing, radius, type, and motion — composable independently of the palette. */
export const foundationTokens = open.defineTokens({
  space: {
    '3xs': density(0.125, 0.125, 0.15),
    '2xs': density(0.25, 0.2, 0.35),
    'xs': density(0.5, 0.375, 0.625),
    'sm': density(0.75, 0.625, 1),
    'md': density(1, 0.8, 1.25),
    'lg': density(1.5, 1.2, 2),
    'xl': density(2.25, 1.75, 3),
    '2xl': density(3.5, 2.75, 4.5),
  },
  size: {
    control: density(2.5, 2.2, 2.85),
    controlSm: density(2, 1.8, 2.25),
  },
  radius: {
    seed: open.tdef.length({
      val: open.length.px(12),
      mutable: true,
      description: 'Runtime-tunable radius seed; the whole scale derives from it.',
    }),
    pill: open.length.px(999),
  },
  font: {
    family: open.tdef({
      val: '"Geist", ui-sans-serif, system-ui, sans-serif',
      mutable: true,
      description: 'The live UI typeface. Runtime-selected between sans, serif, and mono.',
    }),
    mono: open.tdef({
      val: 'ui-monospace, SFMono-Regular, monospace',
      mutable: true,
      description: 'Monospace family; the runtime seeds it with the loaded JetBrains Mono face.',
    }),
  },
  text: {
    micro: text(0.72, 1.4, 500, '0.02em'),
    detail: text(0.78, 1.45, 500),
    label: text(0.85, 1.4, 550),
    body: text(0.95, 1.6, 400),
    lead: text(1.1, 1.55, 400),
    title: text(1.35, 1.25, 640, '-0.01em'),
    heading: text(1.9, 1.15, 680, '-0.02em'),
    display: text(3, 1.02, 700, '-0.03em'),
  },
  duration: {
    quick: open.tdef.time({
      val: open.time.ms(140),
      axes: { motion: { none: open.time.ms(0), springy: open.time.ms(300) } },
    }),
    base: open.tdef.time({
      val: open.time.ms(240),
      axes: { motion: { none: open.time.ms(0), springy: open.time.ms(520) } },
    }),
    slow: open.tdef.time({
      val: open.time.ms(420),
      axes: { motion: { none: open.time.ms(0), springy: open.time.ms(720) } },
    }),
  },
  ease: {
    standard: open.tdef({
      val: 'cubic-bezier(0.2, 0, 0, 1)',
      axes: {
        motion: {
          none: 'linear',
          springy: 'linear(0, 0.4 7.5%, 0.82 19%, 1.09 33%, 1.03 50%, 0.985 68%, 1)',
        },
      },
    }),
    emphasized: open.tdef({ val: 'cubic-bezier(0.3, 0.7, 0, 1)' }),
  },
})
  .add(({ radius }) => ({
    radius: {
      xs: open.calc(radius.seed).multiply(0.45),
      sm: open.calc(radius.seed).multiply(0.7),
      md: radius.seed,
      lg: open.calc(radius.seed).multiply(1.5),
      xl: open.calc(radius.seed).multiply(2.2),
    },
  }))
