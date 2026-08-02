import { colorSchemes, createSystem, data } from '@mszr/vanity'
import { hail } from '@mszr/vanity/presets'

/**
 * Prism's authoring environment.
 *
 * The chain reads as the system's vocabulary of circumstance: plugins add
 * constructors and axes add mutually-exclusive environmental dimensions.
 * Every downstream token module is authored against this one open system.
 */
export const open = createSystem()
  .addAxes({
    scheme: colorSchemes({
      locality: 'element',
      description: 'Platform preference unless the studio root pins light or dark.',
    }),
    density: {
      modes: {
        compact: data('density', 'compact'),
        cozy: '&',
        spacious: data('density', 'spacious'),
      },
      default: 'cozy',
      modeOrder: ['compact', 'cozy', 'spacious'],
      description: 'Interface rhythm — spacing, control size, and shadow lift — independent of viewport.',
    },
    motion: {
      modes: {
        none: data('motion', 'none'),
        subtle: '&',
        springy: data('motion', 'springy'),
      },
      default: 'subtle',
      modeOrder: ['none', 'subtle', 'springy'],
      description: 'Decorative motion profile; prefers-reduced-motion always overrides it.',
    },
  })
  .addPlugin(hail({
    color: {
      elevation: true,
      ranges: {
        l: [0.08, 0.99],
        e: [0, 1],
      },
    },
    size: { base: 4, remTarget: 16 },
    controls: {
      default: 'static',
      overrides: { e: 'mutable' },
    },
    presets: {
      mode: 'opt-in',
      listed: ['reset'],
    },
  }))
