import {
  colorSchemes,
  createSystem,
  data,
  length,
} from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

const open = createSystem()
  .addAxis('scheme', colorSchemes())
  .addAxis('density', {
    modes: {
      cozy: '&',
      compact: data('density', 'compact'),
    },
    default: 'cozy',
  })
const tokens = open.defineTokens({
  space: {
    control: open.tdef({
      val: length.px(40),
      axes: { density: { compact: length.px(32) } },
    }),
  },
  shadow: {
    card: open.tdef({
      val: '0 2px 8px black',
      axes: {
        scheme: { dark: '0 2px 8px black' },
        density: { compact: '0 1px 2px black' },
      },
      cases: [{ when: { scheme: 'dark', density: 'compact' }, val: 'none' }],
    }),
  },
})
const ds = open.addTokens(tokens).consolidate({
  prefix: 'app',
  root: '#widget',
  axisOrder: ['density', 'scheme'],
})

describe('axis types', () => {
  it('preserves exact axes, inferred defaults, branches, and group metadata filtering', () => {
    expectTypeOf(ds.t.space.control.$axes.density.compact.$val).toEqualTypeOf<'32px'>()
    expectTypeOf(ds.t.shadow.card.$case({ scheme: 'dark', density: 'compact' }).$val).toEqualTypeOf<'none'>()
    // @ts-expect-error — group metadata is not a token
    void ds.t.$root
    expectTypeOf(ds.t.space.control.$axes.density.cozy.$val).toEqualTypeOf<'40px'>()
    // @ts-expect-error — a sparse case has one exact authored address
    ds.t.shadow.card.$case({ scheme: 'light', density: 'compact' })
  })

  it('keeps token config constrained to the system axis vocabulary', () => {
    open.tdef({
      val: 'red',
      axes: {
        scheme: {
          // @ts-expect-error — no such scheme mode
          midnight: 'black',
        },
      },
    })
    open.tdef({
      val: 'red',
      axes: {
        // @ts-expect-error — no such system axis
        contrast: { high: 'black' },
      },
    })
    open.tdef({
      val: 'red',
      cases: [{
        when: {
          scheme: 'dark',
          // @ts-expect-error — density modes are exact
          density: 'tiny',
        },
        val: 'black',
      }],
    })
  })

  it('makes consolidation axis order exhaustive and duplicate-free', () => {
    // @ts-expect-error — density is missing
    open.consolidate({ axisOrder: ['scheme'] })
    // @ts-expect-error — scheme is duplicated and density is missing
    open.consolidate({ axisOrder: ['scheme', 'scheme'] })
    // @ts-expect-error — locked systems cannot add an axis
    ds.addAxis('contrast', ['high', 'low'])
  })
})
