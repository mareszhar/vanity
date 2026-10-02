import type { VanityAxisConfig, VanityAxisControl, VanityOpenAxisConfig } from '@mszr/vanity'
import {
  axis,
  colorSchemes,
  createSystem,
  data,
  defineAxes,
  length,
  media,
  selector,
  systemRoot,
  thisMode,
} from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

const open = createSystem()
  .addAxis('scheme', colorSchemes({ locality: 'root' }))
  .addAxis('density', { modes: { compact: data('density', 'compact') } })
  .addAxis('ambient', {
    modes: {
      automatic: media('(prefers-contrast: more)'),
      pinned: data('ambient', 'pinned'),
    },
  })
const ds = open.addTokens({
  color: {
    brand: open.tdef.color({ mutable: true, axes: { scheme: { dark: null } } }),
    fixed: open.oklch(0.5, 0.1, 200),
  },
  shadow: open.tdef({
    val: 'none',
    mutable: true,
    axes: {
      scheme: { dark: null },
      density: { compact: null },
    },
    cases: [{ when: { scheme: 'dark', density: 'compact' }, val: null }],
  }),
}).consolidate()

describe('runtime types', () => {
  it('adds effects only to mutable runtime handles and keeps mode names exact', () => {
    const runtime = ds.runtime()
    expectTypeOf(runtime.t.color.brand.$set).toBeFunction()
    expectTypeOf(runtime.t.color.brand.$axes.scheme.dark.$unset).toBeFunction()
    expectTypeOf(runtime.t.shadow.$case({ scheme: 'dark', density: 'compact' }).$set).toBeFunction()

    runtime.axes.density.$switchTo('compact')
    runtime.axes.scheme.$switchTo('dark')
    runtime.axes.scheme.dark.$activate()
    runtime.axes.ambient.$switchTo('pinned')
    // @ts-expect-error — media-only modes have no activation metadata
    runtime.axes.ambient.$switchTo('automatic')
    // @ts-expect-error — non-activatable modes do not expose $activate
    runtime.axes.ambient.automatic.$activate()
    // @ts-expect-error — axis names come from this system
    runtime.axes.motion.$switchTo('none')
    // @ts-expect-error — mode names come from the chosen axis
    runtime.axes.density.$switchTo('cozy')
    // @ts-expect-error — context-shared handles never imply a DOM target
    ds.t.color.brand.$set('red')
    // @ts-expect-error — nonmutable runtime handles stay read-only
    runtime.t.color.fixed.$set('red')
    // @ts-expect-error — color setters preserve the token's data type
    runtime.t.color.brand.$set(length.rem(1))
    // @ts-expect-error — batch operations are not part of the runtime controller surface
    runtime.applyTokenOverrides({ color: { brand: 'red' } })
  })

  it('makes every custom-controlled mode activatable', () => {
    const open = createSystem().addAxis('custom', {
      modes: {
        automatic: '@media (update: fast)',
        manual: '@media (update: slow)',
      },
      control: {
        id: 'custom-control',
        read: () => undefined,
        activate: (_root, _mode) => {},
      },
    })
    const controlled = open.addTokens({
      value: open.tdef({ axes: { custom: { automatic: 'a', manual: 'b' } } }),
    }).consolidate()
    const runtime = controlled.runtime()

    runtime.axes.custom.$switchTo('automatic')
    runtime.axes.custom.manual.$activate()
    // @ts-expect-error — custom control modes remain exact
    runtime.axes.custom.$switchTo('other')
  })

  it('requires configured controls before promising activation', () => {
    const modes = { automatic: '@media (update: fast)', manual: '@media (update: slow)' } as const
    const control: VanityAxisControl<keyof typeof modes> = { id: 'custom-control', read: () => undefined, activate: () => {} }
    const configuration: VanityOpenAxisConfig<typeof modes, typeof control> = { modes, control }
    // @ts-expect-error — a known control parameter requires its activation implementation
    const missing: VanityOpenAxisConfig<typeof modes, typeof control> = { modes }
    void missing
    const normalized = { automatic: colorSchemes().modes.light, manual: colorSchemes().modes.dark }
    // @ts-expect-error — complete definitions require the same known control
    const missingNormalized: VanityAxisConfig<typeof normalized, Record<never, never>, typeof control> = { modes: normalized }
    void missingNormalized
    const complete: VanityAxisConfig<typeof normalized, Record<never, never>, typeof control> = { modes: normalized, control }
    createSystem().addAxis('custom', axis(complete)).consolidate().snapshotFrom(runtime => runtime.axes.custom.manual.$activate())
    const direct = createSystem().addAxis('custom', configuration).consolidate()
    direct.snapshotFrom(runtime => runtime.axes.custom.manual.$activate())
    const detached = createSystem().addAxes(defineAxes({ custom: configuration })).consolidate()
    detached.snapshotFrom(runtime => runtime.axes.custom.manual.$activate())
    // @ts-expect-error — declared control modes remain exact
    direct.snapshotFrom(runtime => runtime.axes.custom.$switchTo('other'))
    const queryOnly: VanityOpenAxisConfig<typeof modes> = { modes }
    const automatic = createSystem().addAxis('custom', queryOnly).consolidate()
    // @ts-expect-error — optional undefined control cannot make query-only modes activatable
    automatic.snapshotFrom(runtime => runtime.axes.custom.manual.$activate())
    const optional: { modes: typeof modes, control?: typeof control } = { modes }
    const uncertain = createSystem().addAxis('custom', optional).consolidate()
    // @ts-expect-error — an optional control is not evidence of an installed control
    uncertain.snapshotFrom(runtime => runtime.axes.custom.manual.$activate())
    const undefinedControl = createSystem().addAxis('custom', { modes, control: undefined }).consolidate()
    // @ts-expect-error — an explicitly undefined control stays query-only
    undefinedControl.snapshotFrom(runtime => runtime.axes.custom.manual.$activate())
  })

  it('carries thisMode activation metadata through direct axis authoring', () => {
    const open = createSystem().addAxis('density', {
      modes: {
        cozy: '&',
        compact: thisMode,
        dense: data('density', 'dense'),
        automatic: '@media (width > 1px)',
      },
      default: 'cozy',
    })
    const controlled = open.addTokens({
      value: open.tdef({
        axes: { density: { compact: 'a', dense: 'd', automatic: 'b' } },
      }),
    }).consolidate()
    const runtime = controlled.runtime()

    runtime.axes.density.$switchTo('compact')
    runtime.axes.density.$switchTo('cozy')
    runtime.axes.density.$switchTo('dense')
    // @ts-expect-error — a media-only sibling is not activatable
    runtime.axes.density.$switchTo('automatic')
  })

  it('types only compound conditions whose metadata can select the whole condition', () => {
    const open = createSystem().addAxis('compound', {
      modes: {
        anchored: systemRoot.and(data('state', 'anchored')),
        union: data('state', 'union').or(media('(width > 1px)')),
        gated: data('state', 'gated').and(media('(width > 1px)')),
        interactive: thisMode.and(selector('&:hover')),
      },
    })
    const controlled = open.addTokens({
      value: open.tdef({
        axes: { compound: { anchored: 'a', union: 'u', gated: 'g', interactive: 'i' } },
      }),
    }).consolidate()
    const runtime = controlled.runtime()

    runtime.axes.compound.$switchTo('anchored')
    runtime.axes.compound.$switchTo('union')
    // @ts-expect-error — setting one attribute cannot satisfy the media intersection
    runtime.axes.compound.$switchTo('gated')
    // @ts-expect-error — thisMode cannot manufacture an interactive pseudo state
    runtime.axes.compound.$switchTo('interactive')
  })

  it('types validation-atomic transactions through the same exact trees', () => {
    const runtime = ds.runtime()
    runtime.transaction((tx) => {
      tx.t.color.brand.$set('red')
      tx.t.color.brand.$axes.scheme.dark.$set('black')
      tx.t.shadow.$case({ scheme: 'dark', density: 'compact' }).$set('none')
    })
  })

  it('types DOM-free snapshot construction with the same runtime tree', () => {
    const snapshot = ds.snapshotFrom((runtime) => {
      runtime.t.color.brand.$set('red')
      runtime.t.color.brand.$axes.scheme.dark.$set(ds.t.color.brand)
      runtime.axes.scheme.$switchTo('dark')
    })

    expectTypeOf(snapshot).toEqualTypeOf<import('@mszr/vanity').VanityRuntimeSnapshot>()
    // @ts-expect-error — callback tokens retain their runtime data types
    ds.snapshotFrom(runtime => runtime.t.color.brand.$set(length.rem(1)))
  })
})
