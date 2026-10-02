import {
  axis,
  colorSchemes,
  createSystem,
  data,
  defaultMode,
  defineAxes,
  defineCssSupportTarget,
  length,
  oklch,
  thisMode,
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
        dark: ({ light }) => oklch.darken(light, 0.35),
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

describe('owned axis and mode records', () => {
  const prototypeKey = '__proto__'
  it.each(['__proto__', 'constructor', 'toString', 'ordinary'])('owns declared axis %s through independent systems and JSON', (name) => {
    const mode = 'recordMode'
    const owners = [Object.prototype, Object, Object.prototype.toString]
    const descriptors = owners.map(owner => Object.getOwnPropertyDescriptor(owner, mode))
    try {
      const make = (val: string) => {
        const open = createSystem().addAxis(name, { modes: { base: '&', [mode]: thisMode }, default: 'base' })
        return open.addTokens(h => ({ ink: (h.tdef.color as any)({ val: 'black', axes: { [name]: { [mode]: val } } }) })).consolidate({ prefix: 'records' }) as any
      }
      const first = make('red')
      const branch = first.t.ink.$axes[name][mode]
      expect(Object.hasOwn(first.t.ink.$axes, name)).toBe(true)
      expect(typeof branch).toBe('function')
      expect(branch.$val).toBe('red')
      const second = make('blue')
      expect(first.t.ink.$axes[name][mode]).toBe(branch)
      expect(branch.$val).toBe('red')
      expect(second.t.ink.$axes[name][mode].$val).toBe('blue')
      expect(owners.map(owner => Object.getOwnPropertyDescriptor(owner, mode))).toEqual(descriptors)
      const manifest = JSON.parse(JSON.stringify(first.introspect()))
      expect(Object.hasOwn(manifest.runtime.axes, name)).toBe(true)
      expect(manifest.runtime.axisOrder).toEqual([name])
    }
    finally {
      owners.forEach((owner, index) => {
        if (descriptors[index])
          Object.defineProperty(owner, mode, descriptors[index]!)
        else Reflect.deleteProperty(owner, mode)
      })
    }
  })

  it.each(['__proto__', 'constructor', 'toString', 'ordinary'])('owns mode %s through maps, callbacks, bulk and patches', (mode) => {
    const open: any = createSystem().addAxis('pick', { modes: { base: '&', [mode]: thisMode }, default: 'base' })
    const methods = (open.tdef.color({ val: 'black' }) as any).pick({ [mode]: 'red' })
    const callbacks = (open.tdef.color({ val: 'black' }) as any).pick((name: string) => name === mode ? 'red' : 'black')
    const bulk = open.defineTokens({ ink: open.tdef.color({ val: 'black' }), $axes: { pick: (name: string) => ({ ink: name === mode ? 'red' : 'black' }) } } as any)
    const ds = open.addTokens({ methods, callbacks }).addTokens(bulk).overwriteTokens({ methods: (token: any) => token.pick({ [mode]: 'blue' }) }).consolidate({ prefix: 'modes' }) as any
    expect(ds.t.methods.$axes.pick[mode].$val).toBe('blue')
    expect(ds.t.callbacks.$axes.pick[mode].$val).toBe('red')
    expect(ds.t.ink.$axes.pick[mode].$val).toBe('red')
    expect(Object.hasOwn(ds.introspect().runtime.axes.pick.attribute.values, mode)).toBe(true)
  })

  it.each([false, true])('preserves own prebuilt entries, descriptors and forks (null prototype: %s)', (nullPrototype) => {
    const definition = { modes: { base: '&', ['__proto__']: thisMode }, default: 'base' }
    const entries = Object.create(nullPrototype ? null : Object.prototype)
    let reads = 0
    Object.defineProperty(entries, '__proto__', { enumerable: true, configurable: true, get() {
      reads++
      return definition
    } })
    const module = defineAxes(entries)
    expect(reads).toBe(0)
    expect(Object.getPrototypeOf(module.entries)).toBe(Object.getPrototypeOf(entries))
    expect(Object.getOwnPropertyDescriptor(module.entries, '__proto__')?.get).toBe(Object.getOwnPropertyDescriptor(entries, '__proto__')?.get)
    const combined = defineAxes({}).add(module).add(defineAxes({ constructor: ['base', 'on'] })).add(defineAxes({ toString: ['base', 'on'] }))
    const base = createSystem().addAxes([combined, defineAxes({ ordinary: ['base', 'on'] })]) as any
    const fork = base.augmentAxis('__proto__', { modes: { later: thisMode } })
      .overwriteAxis('constructor', { modes: { on: data('constructor', 'changed') } })
    expect(base.expectAxis('__proto__', ['__proto__'])).toBe(base)
    expect(() => base.expectAxis('__proto__', ['later'])).toThrow(/missing/)
    const ds = fork.consolidate({ prefix: 'composition', axisOrder: ['toString', 'constructor', '__proto__', 'ordinary'] })
    expect(ds.introspect().runtime.axisOrder).toEqual(['toString', 'constructor', '__proto__', 'ordinary'])
    expect(Object.hasOwn(ds.introspect().runtime.axes, '__proto__')).toBe(true)
  })

  it('owns derivation contexts, implicit defaults and sparse case addresses', () => {
    const open = createSystem().addAxis('__proto__', axis({
      modes: { ['__proto__']: defaultMode(), constructor: createAxisData('__proto__', 'constructor'), toString: createAxisData('__proto__', 'toString') },
      default: '__proto__',
      derive: { constructor: (modes: any) => {
        expect(Object.hasOwn(modes, '__proto__')).toBe(true)
        return 'red'
      }, toString: () => 'blue' },
    })).addAxis('other', ['off', 'on'])
    const ink = (open.tdef.color as any)({ val: 'black', axes: { ['__proto__']: {} }, cases: [{ when: { ['__proto__']: 'constructor', other: 'on' }, val: 'green' }, { when: { ['__proto__']: 'toString', other: 'on' }, val: 'purple' }] })
    const ds = open.addTokens({ ink }).consolidate({ prefix: 'derived' }) as any
    expect(ds.t.ink.$axes[prototypeKey][prototypeKey].$val).toBe('black')
    expect(ds.t.ink.$axes[prototypeKey].constructor.$val).toBe('red')
    expect(ds.t.ink.$axes[prototypeKey].toString.$val).toBe('blue')
    expect(ds.t.ink.$case({ ['__proto__']: 'constructor', other: 'on' }).$val).toBe('green')
    const implicit = createSystem().addAxis('pick', { modes: { ['__proto__']: defaultMode(), on: thisMode }, default: '__proto__' })
    const defaults = implicit.addTokens({ ink: (implicit.tdef.color as any)({ val: 'black', axes: { pick: { on: 'red' } } }) }).consolidate() as any
    expect(defaults.t.ink.$axes.pick[prototypeKey].$val).toBe('black')
    const projected = JSON.parse(JSON.stringify(defaults.introspect().runtime.axes.pick.attribute.values))
    expect(Object.hasOwn(projected, prototypeKey)).toBe(true)
    expect(projected[prototypeKey]).toBeNull()
    expect(defaults.runtimeProps(defaults.snapshotFrom((rt: any) => rt.axes.pick[prototypeKey].$activate())).$system.attributes).toEqual({})
  })

  it('owns derived special modes and sibling callback contexts in null prototype inputs', () => {
    const modes = Object.assign(Object.create(null), { base: defaultMode(), ['__proto__']: createAxisData('pick', '__proto__'), later: createAxisData('pick', 'later') })
    const derives = Object.assign(Object.create(null), {
      ['__proto__']: () => 'red',
      later: (context: any) => {
        expect(Object.hasOwn(context, '__proto__')).toBe(true)
        return context[prototypeKey]
      },
    })
    const open: any = createSystem().addAxis('pick', axis({ modes, default: 'base', derive: derives }))
    const branches = Object.create(null)
    const axes = Object.assign(Object.create(null), { pick: branches })
    const ds = open.addTokens({ ink: (open.tdef.color as any)({ val: 'black', axes }) }).consolidate() as any
    expect(Object.hasOwn(ds.t.ink.$axes.pick, '__proto__')).toBe(true)
    expect(ds.t.ink.$axes.pick[prototypeKey].$val).toBe('red')
    expect(ds.t.ink.$axes.pick.later.$val).toBe('red')
    const chained = (open.tdef.color({ val: 'black' }) as any).pick({ ['__proto__']: 'blue', later: (context: any) => {
      expect(Object.hasOwn(context, '__proto__')).toBe(true)
      return context[prototypeKey]
    } })
    expect((open.addTokens({ ink: chained }).consolidate() as any).t.ink.$axes.pick.later.$val).toBe('blue')
  })

  it.each(['__proto__', 'constructor', 'toString'])('does not copy inherited axis branches for %s', (name) => {
    const owner = name === '__proto__' ? Object.prototype : name === 'constructor' ? Object : Object.prototype.toString
    const key = 'inheritedRecordBranch'
    const descriptor = Object.getOwnPropertyDescriptor(owner, key)
    try {
      Object.defineProperty(owner, key, { enumerable: true, configurable: true, writable: true, value: 'leaked' })
      const open: any = (createSystem() as any).addAxis(name, ['base', 'on']).addAxis('auxiliary', ['base', 'on'])
      const seed = open.tdef.color({ val: 'black', axes: { auxiliary: { on: 'silver' } } })
      const methods = seed[name]({ on: 'red' })
      const bulk = open.defineTokens({ ink: seed, $axes: { [name]: (mode: string) => ({ ink: mode === 'on' ? 'red' : 'black' }) } })
      const ds = open.addTokens({ methods }).addTokens(bulk).consolidate()
      expect(ds.t.methods.$axes[name].on.$val).toBe('red')
      expect(ds.t.ink.$axes[name].on.$val).toBe('red')
      expect(Object.hasOwn(ds.t.methods.$axes[name], key)).toBe(false)
      expect(Object.getOwnPropertyDescriptor(owner, key)?.value).toBe('leaked')
    }
    finally {
      if (descriptor)
        Object.defineProperty(owner, key, descriptor)
      else Reflect.deleteProperty(owner, key)
    }
  })

  it('does not manufacture undeclared inherited patch methods', () => {
    const open: any = createSystem()
    const staged = open.addTokens({ ink: open.tdef.color({ val: 'black' }) })
    const ds = staged.overwriteTokens({ ink: (token: any) => {
      for (const name of ['__proto__', 'constructor', 'toString']) expect(token[name]).toBeUndefined()
      const configured = token.val('blue')
      for (const name of ['__proto__', 'constructor', 'toString']) expect(configured[name]).toBe(Reflect.get(Object.getPrototypeOf(configured), name, configured))
      return configured
    } }).consolidate()
    expect(ds.t.ink.$val).toBe('blue')
  })

  it('does not derive undeclared JavaScript functions and keeps unknown names diagnostic', () => {
    const open = createSystem().addAxis('pick', axis({ modes: Object.fromEntries([['base', defaultMode()], ['constructor', createAxisData('pick', 'constructor')], ['toString', createAxisData('pick', 'toString')]]), derive: Object.fromEntries([['base', () => 'black']]) }))
    const ds = open.addTokens({ ink: (open.tdef.color as any)({ val: 'black', axes: { pick: {} } }) }).consolidate() as any
    expect(Object.hasOwn(ds.t.ink.$axes.pick ?? {}, 'constructor')).toBe(false)
    expect(Object.hasOwn(ds.t.ink.$axes.pick ?? {}, 'toString')).toBe(false)
    const empty = createSystem().addAxis('ordinary', ['base', 'on']) as any
    for (const name of ['__proto__', 'constructor', 'toString']) {
      expect(() => empty.tdef({ axes: { [name]: { on: 'red' } } })).toThrow(/VANITY_TOKENS_UNKNOWN_AXIS/)
      expect(() => empty.tdef({ axes: { [name]: () => 'red' } })).toThrow(/VANITY_TOKENS_UNKNOWN_AXIS/)
      expect(() => empty.tdef({ val: 'black', cases: [{ when: { [name]: 'on', another: 'on' }, val: 'red' }] })).toThrow(/VANITY_TOKENS_UNKNOWN_AXIS/)
      expect(() => empty.defineTokens({ ink: empty.tdef({ val: 'black' }), $axes: { [name]: () => ({ ink: 'red' }) } })).toThrow(/VANITY_TOKENS_UNKNOWN_AXIS/)
      expect(() => empty.augmentAxis(name, { modes: { on: thisMode } })).toThrow(/unknown axis/)
      expect(() => empty.overwriteAxis(name, { modes: { on: thisMode } })).toThrow(/unknown axis/)
      expect(() => empty.expectAxis(name)).toThrow(/missing/)
      const configured = empty.tdef({ val: 'black' })
      expect(configured[name]).toBe(Reflect.get(Object.getPrototypeOf(configured), name, configured))
    }
  })
})

describe('complete direct axis configuration', () => {
  const config = {
    modes: { base: '&', later: thisMode },
    default: 'base',
    modeOrder: ['later', 'base'],
    derive: { later: () => 'red' },
    description: 'Direct derivation',
  } as const
  // Runtime form parameterization erases shape differences; the adjacent type cell
  // checks each ordinary unannotated literal and inferred branch independently.
  const forms: Record<string, () => any> = {
    direct: () => createSystem().addAxis('pick', config),
    callback: () => createSystem().addAxis('pick', () => config),
    record: () => createSystem().addAxes({ pick: config }),
    recordCallback: () => createSystem().addAxes(() => ({ pick: config })),
    detached: () => createSystem().addAxes(defineAxes({ pick: config })),
    named: () => createSystem().addAxes(defineAxes().add('pick', config)),
    namedCallback: () => createSystem().addAxes(defineAxes().add('pick', () => config)),
    entries: () => createSystem().addAxes(defineAxes().add({ pick: config })),
    entriesCallback: () => createSystem().addAxes(defineAxes().add(() => ({ pick: config }))),
    modules: () => createSystem().addAxes([defineAxes({ pick: config })]),
  }
  it.each(Object.entries(forms))('%s lowers derivations and keeps authored precedence', (_name, make) => {
    const open = make()
    const { css, returned: ds } = emit(() => inSystemScope(() => emitSystem(open.addTokens({
      ink: open.tdef({ val: 'black', axes: { pick: {} } }),
      authored: open.tdef({ val: 'black', axes: { pick: { later: 'blue' } } }),
    }).consolidate())))
    expect(ds.t.ink.$axes.pick.later.$val).toBe('red')
    expect(ds.t.authored.$axes.pick.later.$val).toBe('blue')
    expect(css).toMatch(/:\s*red;/)
    expect(ds.introspect().axes.pick).toMatchObject({
      defaultMode: 'base',
      modeOrder: ['later', 'base'],
      description: 'Direct derivation',
      modes: { later: { derived: true }, base: { derived: false } },
    })
  })

  it('keeps direct derivations isolated through augmentation and overwrite', () => {
    const base = createSystem().addAxis('pick', config)
    const augmented = base.augmentAxis('pick', { modes: { last: data('pick', 'last') }, derive: { last: () => 'green' } })
    const overwritten = base.overwriteAxis('pick', { derive: { later: () => 'blue' } })
    const baseDs = emit(() => inSystemScope(() => emitSystem(base.addTokens({ ink: base.tdef({ val: 'black', axes: { pick: {} } }) }).consolidate()))).returned
    const overwrittenDs = emit(() => inSystemScope(() => emitSystem(overwritten.addTokens({ ink: overwritten.tdef({ val: 'black', axes: { pick: {} } }) }).consolidate()))).returned
    expect(baseDs.t.ink.$axes.pick.later.$val).toBe('red')
    expect(overwrittenDs.t.ink.$axes.pick.later.$val).toBe('blue')
    const ds = emit(() => inSystemScope(() => emitSystem(augmented.addTokens({
      ink: augmented.tdef({ val: 'black', axes: { pick: {} } }),
    }).consolidate()))).returned
    expect(ds.t.ink.$axes.pick.later.$val).toBe('red')
    expect(ds.t.ink.$axes.pick.last.$val).toBe('green')
  })

  it('uses canonical validation for invalid direct derivations', () => {
    expect(() => createSystem().addAxis('pick', { ...config, derive: { wrong: () => 'red' } } as any)).toThrow(/derive.*unknown mode|derive.*no mode/)
    expect(() => createSystem().addAxis('pick', { ...config, derive: { later: 'red' } } as any)).toThrow(/derivation.*function/)
  })

  it.each(['element', 'root'] as const)('preserves %s native policy in direct and detached inputs', (locality) => {
    const scheme = colorSchemes({ locality })
    const input = { modes: scheme.modes, default: 'light', native: scheme.native } as const
    const direct = createSystem().addAxis('appearance', input)
    const detached = createSystem().addAxes(defineAxes({ appearance: input }))
    const complete = createSystem().addAxis('appearance', axis(input))
    const systems = [
      () => direct.addTokens({ ink: direct.tdef.color({ axes: { appearance: { light: 'white', dark: 'black' } } }) }).consolidate(),
      () => detached.addTokens({ ink: detached.tdef.color({ axes: { appearance: { light: 'white', dark: 'black' } } }) }).consolidate(),
      () => complete.addTokens({ ink: complete.tdef.color({ axes: { appearance: { light: 'white', dark: 'black' } } }) }).consolidate(),
    ]
    for (const make of systems) {
      const { css, returned: ds } = emit(() => inSystemScope(() => emitSystem(make())))
      expect(ds.introspect().axes.appearance.native).toEqual(scheme.native)
      expect(css).toContain('light-dark(')
      const snapshot = ds.snapshotFrom(rt => rt.axes.appearance.dark.$activate())
      // Explicit direct triggers retain their authored carrier; only the convenience
      // definition binds a scheme carrier relative to its eventual mount name.
      expect(ds.runtimeProps(snapshot).$system.attributes).toMatchObject({ 'data-scheme': 'dark' })
    }
  })

  it('keeps native support diagnostics and document fallback for direct inputs', () => {
    const support = defineCssSupportTarget({ id: 'without-light-dark', features: ['custom-properties'] })
    const make = (fallback: 'diagnose' | 'document', locality: 'element' | 'root' = 'element') => {
      const scheme = colorSchemes({ fallback, locality })
      const open = createSystem({ support }).addAxis('scheme', { modes: scheme.modes, native: scheme.native })
      return () => emit(() => inSystemScope(() => emitSystem(open.addTokens({
        ink: open.tdef.color({ axes: { scheme: { light: 'white', dark: 'black' } } }),
      }).consolidate())))
    }
    expect(make('diagnose')).toThrow(/lacks light-dark/)
    const { css, returned: ds } = make('document')()
    expect(css).not.toContain('light-dark(')
    expect(ds.introspect().axes.scheme.native).toMatchObject({ fallback: 'document' })
    const root = make('diagnose', 'root')()
    expect(root.css).not.toContain('light-dark(')
    expect(root.returned.introspect().axes.scheme.native).toMatchObject({ locality: 'root', fallback: 'diagnose' })
  })
})
