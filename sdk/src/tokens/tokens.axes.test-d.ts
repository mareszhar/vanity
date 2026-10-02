import type { VanityAxisConfig, VanityOpenAxisConfig } from '@mszr/vanity'
import {
  axis,
  colorSchemes,
  createSystem,
  data,
  defineAxes,
  defineConditions,
  length,
  thisMode,
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

it('infers ordinary direct and detached derivations with exact sibling vocabulary', () => {
  const direct = createSystem().addAxis('pick', {
    modes: { base: '&', later: thisMode },
    derive: { later: (siblings) => {
      expectTypeOf<keyof typeof siblings>().toEqualTypeOf<'base' | 'later'>()
      void siblings.base
      // @ts-expect-error — sibling modes are exact
      void siblings.wrong
      return 42 as const
    } },
  })
  const callback = createSystem().addAxis('pick', () => ({
    modes: { base: '&', later: thisMode },
    derive: { later: (siblings) => {
      void siblings.base
      return 'red' as const
    } },
  }))
  const record = createSystem().addAxes({
    pick: { modes: { base: '&', later: thisMode }, derive: { later: (siblings) => {
      void siblings.base
      return 42 as const
    } } },
    density: ['cozy', 'compact'],
  })
  const recordCallback = createSystem().addAxes(() => ({
    pick: { modes: { base: '&', later: thisMode }, derive: { later: (siblings) => {
      void siblings.base
      return 42 as const
    } } },
  }))
  const seeded = defineAxes({
    pick: { modes: { base: '&', later: thisMode }, derive: { later: (siblings) => {
      expectTypeOf<keyof typeof siblings>().toEqualTypeOf<'base' | 'later'>()
      void siblings.base
      return 42 as const
    } } },
    density: ['cozy', 'compact'],
  })
  const named = defineAxes().add('pick', { modes: { base: '&', later: thisMode }, derive: { later: (siblings) => {
    expectTypeOf<keyof typeof siblings>().toEqualTypeOf<'base' | 'later'>()
    void siblings.base
    return 42 as const
  } } })
  const namedCallback = defineAxes().add('pick', () => ({ modes: { base: '&', later: thisMode }, derive: { later: (siblings) => {
    void siblings.base
    return 42 as const
  } } }))
  const entries = defineAxes().add({ pick: { modes: { base: '&', later: thisMode }, derive: { later: (siblings) => {
    expectTypeOf<keyof typeof siblings>().toEqualTypeOf<'base' | 'later'>()
    void siblings.base
    return 42 as const
  } } }, density: ['cozy', 'compact'] })
  const entriesCallback = defineAxes().add(() => ({ pick: { modes: { base: '&', later: thisMode }, derive: { later: (siblings) => {
    void siblings.base
    return 42 as const
  } } } }))
  expectTypeOf(direct.addTokens({ ink: direct.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  expectTypeOf(record.addTokens({ ink: record.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  expectTypeOf(recordCallback.addTokens({ ink: recordCallback.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  const seededOpen = createSystem().addAxes(seeded)
  expectTypeOf(seededOpen.addTokens({ ink: seededOpen.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  const namedOpen = createSystem().addAxes(named)
  expectTypeOf(namedOpen.addTokens({ ink: namedOpen.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  const namedCallbackOpen = createSystem().addAxes(namedCallback)
  expectTypeOf(namedCallbackOpen.addTokens({ ink: namedCallbackOpen.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  const entriesOpen = createSystem().addAxes(entries)
  expectTypeOf(entriesOpen.addTokens({ ink: entriesOpen.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  const entriesCallbackOpen = createSystem().addAxes(entriesCallback)
  expectTypeOf(entriesCallbackOpen.addTokens({ ink: entriesCallbackOpen.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  const ds = callback.addTokens({ ink: callback.tdef({ val: 'black', axes: { pick: {} } }) }).consolidate()
  expectTypeOf(ds.t.ink.$axes.pick.later.$val).toEqualTypeOf<'red'>()
  const modes = { base: '&', later: thisMode } as const
  const configuration: VanityOpenAxisConfig<typeof modes, undefined, { later: () => 42 }> = { modes, derive: { later: () => 42 } }
  // @ts-expect-error — a declared derivation requires the callback that produces its branch
  const missingDerive: VanityOpenAxisConfig<typeof modes, undefined, { later: () => 42 }> = { modes }
  void missingDerive
  const normalizedModes = { base: colorSchemes().modes.light, later: colorSchemes().modes.dark }
  // @ts-expect-error — complete definitions require their known derivation too
  const missingNormalized: VanityAxisConfig<typeof normalizedModes, { later: () => 42 }> = { modes: normalizedModes }
  void missingNormalized
  const optionalCallbacks: VanityAxisConfig<typeof normalizedModes, Partial<{ later: () => 42 }>> = { modes: normalizedModes }
  const uncertainComplete = createSystem().addAxis('pick', axis(optionalCallbacks))
  const uncertainCompleteDs = uncertainComplete.addTokens({ ink: uncertainComplete.tdef({ val: 1, axes: { pick: {} } }) }).consolidate()
  // @ts-expect-error — optional callbacks do not guarantee a derived branch
  void uncertainCompleteDs.t.ink.$axes.pick.later
  const sometimes = createSystem().addAxis('pick', { modes, derive: { later: (): 42 | undefined => undefined } })
  const sometimesDs = sometimes.addTokens({ ink: sometimes.tdef({ val: 1, axes: { pick: {} } }) }).consolidate()
  // @ts-expect-error — a derivation may omit its result instead of producing a branch
  void sometimesDs.t.ink.$axes.pick.later
  const authoredSometimes = sometimes.addTokens({ ink: sometimes.tdef({ val: 1, axes: { pick: { later: 42 as const } } }) }).consolidate()
  expectTypeOf(authoredSometimes.t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  const optional: { modes: typeof modes, derive?: { later: () => 42 } } = { modes }
  const uncertain = createSystem().addAxis('pick', optional)
  const uncertainTokens = uncertain.addTokens({ ink: uncertain.tdef({ val: 1, axes: { pick: {} } }) }).consolidate()
  // @ts-expect-error — optional metadata cannot promise an unauthored branch
  void uncertainTokens.t.ink.$axes.pick.later
  const configured = createSystem().addAxis('pick', configuration)
  expectTypeOf(configured.addTokens({ ink: configured.tdef({ val: 1, axes: { pick: {} } }) }).consolidate().t.ink.$axes.pick.later.$val).toEqualTypeOf<42>()
  const scheme = colorSchemes()
  const native: VanityOpenAxisConfig<typeof scheme.modes> = { modes: scheme.modes, native: scheme.native }
  expectTypeOf(createSystem().addAxis('scheme', native).axes.scheme.modes).toHaveProperty('dark')
  // @ts-expect-error — detached values retain the complete configuration grammar
  defineAxes().add('invalid', { modes: { base: '&' }, description: 42 })
  // @ts-expect-error — detached callback values retain the complete configuration grammar
  defineAxes().add('invalid', () => ({ modes: { base: '&' }, description: 42 }))
  // @ts-expect-error — detached record values retain the complete configuration grammar
  defineAxes().add({ invalid: { modes: { base: '&' }, description: 42 } })
  // @ts-expect-error — detached callback records retain the complete configuration grammar
  defineAxes().add(() => ({ invalid: { modes: { base: '&' }, description: 42 } }))
  // @ts-expect-error — inferred modes remain exact
  record.tdef({ val: 1, axes: { pick: { wrong: 2 } } })
  // @ts-expect-error — tuple modes remain exact beside a configured axis
  record.tdef({ val: 1, axes: { density: { wrong: 2 } } })
})

it('preserves explicit type arguments in axis and detached definition composition', () => {
  const input = { modes: { base: '&', later: thisMode }, derive: { later: () => 42 as const } } as const
  const entries = { pick: input } as const
  const direct = createSystem().addAxis<'pick', typeof input>('pick', input)
  expectTypeOf(direct.axes.pick.derive.later()).toEqualTypeOf<42>()
  createSystem().addAxis<'pick', typeof input>('pick', () => input)
  createSystem().addAxes<typeof entries>(entries)
  createSystem().addAxes<typeof entries>(() => entries)
  const detached = [
    defineAxes().add<'pick', typeof input>('pick', input),
    defineAxes().add<'pick', typeof input>('pick', () => input),
    defineAxes().add<typeof entries>(entries),
    defineAxes().add<typeof entries>(() => entries),
  ]
  for (const module of detached)
    expectTypeOf(module.entries.pick.derive.later()).toEqualTypeOf<42>()
  const selected = '&[data-selected]' as const
  const conditions = { selected } as const
  const conditionModules = [
    defineConditions().add<'selected', typeof selected>('selected', selected),
    defineConditions().add<'selected', typeof selected>('selected', () => selected),
    defineConditions().add<typeof conditions>(conditions),
    defineConditions().add<typeof conditions>(() => conditions),
  ]
  for (const module of conditionModules)
    expectTypeOf(module.entries.selected).toEqualTypeOf<typeof selected>()
})
