import {
  axis,
  colorSchemes,
  createSystem,
  darken,
  data,
  defineCssSupportTarget,
  length,
  oklch,
} from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { collectInspection } from '../introspect/records'
import { substrate } from '../substrate'
import { createAbsoluteAxisCondition, createAxisCondition, createAxisData } from '../system/axes'

function inSystemScope<T>(body: () => T): T {
  return substrate.modules.runInFileScope({
    filePath: 'src/tokens/tokens.axes.system.ts',
    packageName: '@vanity/fixture',
  }, body)
}

function emitSystem<T extends { readonly class: unknown }>(system: T): T {
  void system.class
  return system
}

describe('axis declarations and contexts', () => {
  it('stages immutable axes with declaration order and an exhaustive consolidation order', () => {
    const environmental = createSystem()
      .addAxis('scheme', colorSchemes())
      .addAxis('density', {
        modes: {
          cozy: data('density', 'cozy'),
          compact: data('density', 'compact'),
        },
        default: 'cozy',
      })
    const { returned: reordered } = emit(() => inSystemScope(() => emitSystem(environmental.consolidate({
      axisOrder: ['density', 'scheme'],
    }))))

    expect(reordered.introspect().runtime.axisOrder).toEqual(['density', 'scheme'])
    expect(() => inSystemScope(() => environmental.consolidate({ axisOrder: ['scheme'] } as any)))
      .toThrow(/every name exactly once.*missing: density/)
    expect(() => inSystemScope(() => environmental.consolidate({ axisOrder: ['scheme', 'scheme'] } as any)))
      .toThrow(/duplicate: scheme/)
    expect(() => createSystem().addAxis('density', {
      modes: { compact: data('density', 'compact'), dense: data('density', 'compact') },
    })).toThrow(/same trigger at the same priority/)
    expect(() => createSystem().addAxis('density', {
      modes: { compact: data('density', 'compact'), cozy: data('density', 'cozy') },
      modeOrder: ['compact'],
    })).toThrow(/modeOrder.*every name exactly once.*missing: cozy/)
    expect(() => createSystem().addAxis('density', {
      modes: { compact: createAxisCondition('& [data-density=compact]', { on: 'root' }) },
    })).toThrow(/anchored as 'descendant'.*declares on: 'root'/)
    expect(() => createSystem().addAxis('0', {
      modes: { on: data('state', 'on') },
    })).toThrow(/integer-like/)
  })

  it('validates totality, modes, cases, branch types, and mutable reservations locally', () => {
    const open = createSystem()
      .addAxis('scheme', colorSchemes())
      .addAxis('density', {
        modes: { compact: data('density', 'compact'), cozy: data('density', 'cozy') },
      })

    const incomplete = open.tdef({ axes: { scheme: { light: 'white' } } })
    expect(() => incomplete).not.toThrow()
    const complete = () => emit(() => inSystemScope(() => emitSystem(
      open
        .addTokens({ incomplete })
        .consolidate(),
    )))
    expect(complete).not.toThrow()
    expect(() => open.tdef({ val: 'red', axes: { scheme: { midnight: 'black' } } } as any))
      .toThrow(/no mode 'midnight'/)
    expect(() => open.tdef({
      val: 'red',
      cases: [{ when: { scheme: 'dark' }, val: 'black' }],
    } as any)).toThrow(/at least two declared axes/)
    expect(() => open.tdef({
      val: 'red',
      cases: [
        { when: { scheme: 'dark', density: 'compact' }, val: 'black' },
        { when: { density: 'compact', scheme: 'dark' }, val: 'white' },
      ],
    } as any)).toThrow(/duplicate token case/)
    const mismatchedDefinition = () => open.tdef({
      val: length.px(8),
      axes: { scheme: { dark: oklch(0.2, 0, 0) } },
    })
    expect(mismatchedDefinition).not.toThrow()
    expect(() => emit(() => inSystemScope(() => emitSystem(open.addTokens({
      mismatch: open.tdef({ val: length.px(8), axes: { scheme: { dark: oklch(0.2, 0, 0) } } }),
    }).consolidate())))).toThrow(/use a length value.*branch is color/)
    expect(() => emit(() => inSystemScope(() => emitSystem(open.addTokens({
      invalid: open.tdef({ val: 'red', axes: { scheme: { dark: null } } } as any),
    }).consolidate())))).toThrow(/requires mutable: true/)
  })

  it('derives missing modes from sibling values and preserves exact branch handles', () => {
    const open = createSystem().addAxis('scheme', axis({
      modes: {
        light: createAxisData('scheme', 'light'),
        dark: createAxisData('scheme', 'dark'),
      },
      default: 'light',
      derive: {
        dark: ({ light }) => darken(light, 0.35),
      },
    }))
    const { returned: ds } = emit(() => inSystemScope(() => emitSystem(open.addTokens({
      color: {
        brand: open.tdef({ axes: { scheme: { light: oklch(0.72, 0.16, 285) } } }),
      },
    }).consolidate())))

    expect(ds.t.color.brand.$axes.scheme.light.$val).toBe('oklch(0.72 0.16 285)')
    expect(ds.t.color.brand.$axes.scheme.dark.$val).toContain('oklch(')
  })

  it('lowers axis derivations into modules before compatible-system finalization', () => {
    const make = (derived: string, description: string) => axis({
      modes: {
        light: createAxisData('scheme', 'light'),
        dark: createAxisData('scheme', 'dark'),
      },
      default: 'light',
      derive: { dark: () => derived },
      description,
    })
    const authoring = createSystem().addAxis('scheme', make('authored-dark', 'Original documentation'))
    const hmrEquivalent = createSystem().addAxis('scheme', make('later-dark', 'Edited during HMR'))
    const module = authoring.defineTokens({
      color: { accent: authoring.tdef({ axes: { scheme: { light: 'light' } } }) },
    })

    const { returned: ds } = emit(() => inSystemScope(() => emitSystem(hmrEquivalent.addTokens(module).consolidate())))
    expect(ds.t.color.accent.$axes.scheme.dark.$val).toBe('authored-dark')
  })

  it('composes group roots and rejects mutable substitution outside them', () => {
    const open = createSystem()
      .addAxis('density', { modes: { compact: data('density', 'compact') } })
      .addAxis('descendant', { modes: { active: createAxisCondition('[data-active]', { on: 'descendant' }) } })
    const module = open.defineTokens({
      space: open.tdef({ val: '12px', axes: { density: { compact: '8px' } } }),
    }).root('#app .widget')
    const { css } = emit(() => inSystemScope(() => emitSystem(open.addTokens(module).consolidate())))

    expect(css).toContain('#app .widget')
    expect(css).toContain('[data-density=\'compact\']')
    expect(() => emit(() => inSystemScope(() => emitSystem(open.addTokens({
      unsafe: open.tdef({ val: '1', mutable: true, axes: { descendant: { active: '2' } } }),
    }).consolidate())))).toThrow(/mutable bindings must compute on their effective root/)
  })

  it('guards native scheme locality, registration timing, and support fallback', () => {
    const local = createSystem().addAxis('scheme', colorSchemes())
    expect(() => emit(() => inSystemScope(() => emitSystem(local.addTokens({
      color: {
        accent: local.tdef.color({
          axes: { scheme: { light: 'white', dark: 'black' } },
          register: { syntax: '<color>', inherits: true, initialVal: 'white' },
        }),
      },
    }).consolidate())))).toThrow(/preserve element-local light-dark/)

    expect(() => emit(() => inSystemScope(() => emitSystem(local.addTokens({
      color: {
        accent: local.tdef.color({
          axes: { scheme: { light: 'white', dark: 'black' } },
          register: { syntax: '*', inherits: true },
        }),
      },
    }).consolidate())))).not.toThrow()

    expect(() => emit(() => inSystemScope(() => emitSystem(local.addTokens({
      color: {
        accent: local.tdef.color({ register: { initialVal: length.px(8) } } as any),
      },
    }).consolidate())))).toThrow(/register\.initialVal conflicts[\s\S]*use a color value; this branch is length/)

    const unsupportedTarget = createSystem({
      support: defineCssSupportTarget({ id: 'without-light-dark', features: ['custom-properties'] }),
    }).addAxis('scheme', colorSchemes())
    expect(() => emit(() => inSystemScope(() => emitSystem(unsupportedTarget.addTokens({
      color: { accent: unsupportedTarget.tdef.color({ axes: { scheme: { light: 'white', dark: 'black' } } }) },
    }).consolidate())))).toThrow(/requests element-local scheme selection.*lacks light-dark/)

    const rootBound = createSystem({
      support: defineCssSupportTarget({ id: 'without-light-dark', features: ['custom-properties'] }),
    }).addAxis('scheme', colorSchemes({ locality: 'root' }))
    expect(() => emit(() => inSystemScope(() => emitSystem(rootBound.addTokens({
      color: { accent: rootBound.tdef.color({ axes: { scheme: { light: 'white', dark: 'black' } } }) },
    }).consolidate())))).not.toThrow()
  })

  it('records axis order, arm locality, and resolved token contexts for inspection', () => {
    const open = createSystem()
      .addAxis('density', {
        modes: {
          compact: createAxisData('density', 'compact', { priority: 20 }),
          print: createAxisCondition('@media print', { priority: 0 }),
          portal: createAbsoluteAxisCondition('#portal[data-density=compact]', { priority: 30 }),
          child: createAxisCondition('& [data-density=child]'),
        },
      })
    const { records } = collectInspection(() => emit(() => inSystemScope(() => emitSystem(open.addTokens({
      space: { control: open.tdef({ val: '12px', axes: { density: { compact: '8px' } } }) },
    }).consolidate()))))

    const system = records.find(record => record.kind === 'system')
    const token = records.find(record => record.kind === 'token' && record.path === 'space.control')
    expect(system).toMatchObject({
      kind: 'system',
      axes: {
        order: ['density'],
        definitions: {
          density: {
            modeOrder: ['compact', 'print', 'portal', 'child'],
            modes: {
              compact: { arms: [{ locality: 'root', placement: 'root', priority: 20 }] },
              print: { arms: [{ locality: 'document', placement: 'query', priority: 0 }] },
              portal: { arms: [{ locality: 'absolute', placement: 'absolute', priority: 30 }] },
              child: { arms: [{ locality: 'subtree', placement: 'descendant', priority: 0 }] },
            },
          },
        },
      },
    })
    expect(token).toMatchObject({
      kind: 'token',
      emission: [
        { kind: 'base', root: ':root', layer: 'vanity.tokens.base' },
        {
          kind: 'axis',
          axis: 'density',
          mode: 'compact',
          root: ':is(:root)[data-density=\'compact\']',
          locality: 'root',
          placement: 'root',
          priority: 20,
          layer: 'vanity.tokens.axes.density',
        },
      ],
    })
  })

  it('rejects an incompatible system-bound token module with a diagnostic', () => {
    const one = createSystem().addAxis('scheme', colorSchemes())
    const two = createSystem().addAxis('density', { modes: { compact: data('density', 'compact') } })
    const module = one.defineTokens({
      color: { accent: one.tdef({ axes: { scheme: { light: 'white', dark: 'black' } } }) },
    })

    expect(() => two.addTokens(module)).toThrow(/VANITY_TOKEN_MODULE_INCOMPATIBLE/)
  })
})
