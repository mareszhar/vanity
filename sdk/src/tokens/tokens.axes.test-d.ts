import { createEngine } from '@test/legacy'
import { describe, expectTypeOf, it } from 'vitest'

const environmental = createEngine().axes(({ axis, data, defaultMode, scheme }) => ({
  scheme: scheme(),
  density: axis({
    modes: {
      cozy: defaultMode(data('density', 'cozy')),
      compact: data('density', 'compact'),
    },
  }),
}))
const ordered = environmental.axisOrder('density', 'scheme')
const control = ordered.token({
  val: ordered.length.px(40),
  axes: { density: { compact: ordered.length.px(32) } },
})
const ds = ordered.createSystem({
  tokens: {
    $root: '#widget',
    space: {
      control,
    },
    shadow: {
      card: ordered.token({
        val: '0 2px 8px black',
        axes: {
          scheme: { dark: '0 2px 8px black' },
          density: { compact: '0 1px 2px black' },
        },
        cases: [{ when: { scheme: 'dark', density: 'compact' }, val: 'none' }],
      }),
    },
  },
})

describe('axis types', () => {
  it('preserves exact axes, modes, branches, cases, and group metadata filtering', () => {
    expectTypeOf(ds.t.space.control.$axes.density.compact.$val).toEqualTypeOf<'32px'>()
    expectTypeOf(ds.t.shadow.card.$case({ scheme: 'dark', density: 'compact' }).$val).toEqualTypeOf<'none'>()
    // @ts-expect-error — group metadata is not a token
    void ds.t.$root
    // @ts-expect-error — cozy was not authored on this token
    void ds.t.space.control.$axes.density.cozy
    // @ts-expect-error — a sparse case has one exact authored address
    ds.t.shadow.card.$case({ scheme: 'light', density: 'compact' })
  })

  it('keeps token config constrained to the engine axis vocabulary', () => {
    environmental.token({
      val: 'red',
      axes: {
        scheme: {
          // @ts-expect-error — no such scheme mode
          midnight: 'black',
        },
      },
    })
    environmental.token({
      val: 'red',
      axes: {
        // @ts-expect-error — no such environmental axis
        contrast: { high: 'black' },
      },
    })
    environmental.token({
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

  it('makes axisOrder exhaustive and duplicate-free', () => {
    // @ts-expect-error — density is missing
    environmental.axisOrder('scheme')
    // @ts-expect-error — scheme is duplicated and density is missing
    environmental.axisOrder('scheme', 'scheme')
    // @ts-expect-error — engine definition helpers remain engine-only
    void ds.axes
  })
})
