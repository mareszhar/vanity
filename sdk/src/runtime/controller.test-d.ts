import {
  colorSchemes,
  createSystem,
  data,
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
