import type {
  VanityRuntimeSnapshot,
  VanityRuntimeStyleDeclaration,
  VanityRuntimeTarget,
} from '../index'
import {
  colorSchemes,
  createSystem,
  data,
  media,
  scope as scopeCondition,
  selector,
  systemRoot,
  thisMode,
} from '@mszr/vanity'
import { setCustomProperties, setCustomProperty, VanityRuntimeError } from '@mszr/vanity/runtime'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { customProperty } from '../index'
import { buildManifest } from '../introspect/manifest'
import { collectInspection } from '../introspect/records'
import { substrate } from '../substrate'

class MemoryStyle implements VanityRuntimeStyleDeclaration {
  readonly values = new Map<string, string>()
  writes = 0
  removals = 0

  setProperty(name: string, value: string): void {
    this.writes++
    this.values.set(name, value)
  }

  removeProperty(name: string): string {
    this.removals++
    const prior = this.values.get(name) ?? ''
    this.values.delete(name)
    return prior
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? ''
  }
}

class MemoryRoot implements VanityRuntimeTarget {
  readonly style = new MemoryStyle()
  readonly attributes = new Map<string, string>()
  attributeWrites = 0
  readonly ownerDocument = null

  constructor(readonly selector = '#app') {}

  setAttribute(name: string, value: string): void {
    this.attributeWrites++
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributeWrites++
    this.attributes.delete(name)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  matches(selector: string): boolean {
    return selector === this.selector
  }

  querySelectorAll(): readonly MemoryRoot[] {
    return []
  }
}

class MemoryScope {
  readonly roots = new Map<string, MemoryRoot[]>()
  queries = 0

  add(root: MemoryRoot): void {
    const matches = this.roots.get(root.selector) ?? []
    matches.push(root)
    this.roots.set(root.selector, matches)
  }

  querySelectorAll(selector: string): readonly MemoryRoot[] {
    this.queries++
    return this.roots.get(selector) ?? []
  }
}

function createFixture(extra = false) {
  const positive = {
    '~standard': {
      version: 1 as const,
      vendor: 'runtime-fixture',
      validate: (input: unknown) => typeof input === 'number' && input > 0
        ? { value: Math.round(input * 10) / 10 }
        : { issues: [{ message: 'expected a positive number' }] },
    },
  }
  const open = createSystem()
    .addAxis('scheme', colorSchemes({ locality: 'root' }))
    .addAxis('density', {
      modes: {
        cozy: '&',
        compact: data('density', 'compact'),
      },
      default: 'cozy',
    })
  const staged = open.addTokens({
    color: {
      brand: open.tdef.color({
        val: open.oklch(0.62, 0.18, 285),
        mutable: true,
        axes: { scheme: { dark: null } },
      }),
      fixed: open.oklch(0.4, 0.1, 120),
    },
    space: {
      control: open.tdef.length({ mutable: true, register: { initialVal: open.length.px(16) } }),
    },
    shadow: {
      card: open.tdef({
        val: '0 1px 2px #0002',
        mutable: true,
        axes: { density: { compact: '0 2px 4px #0003' } },
        cases: [{ when: { scheme: 'dark', density: 'compact' }, val: null }],
      }),
    },
    ratio: open.tdef.number({
      mutable: true,
      validate: {
        id: 'positive-ratio',
        schema: positive,
        runtime: 'always',
        onInvalid: 'throw',
      },
    }),
    fallbackRatio: open.tdef.number({
      mutable: true,
      validate: {
        id: 'positive-ratio',
        schema: positive,
        runtime: 'always',
        onInvalid: 'fallback',
        fallback: 1,
      },
    }),
    optionalRatio: open.tdef.number({
      mutable: true,
      validate: {
        id: 'positive-ratio',
        schema: positive,
        runtime: 'always',
        onInvalid: 'omit',
      },
    }),
    ...(extra ? { added: open.tdef.length({ mutable: true }) } : {}),
  })
  const { returned: ds, css } = emit(() => substrate.modules.runInFileScope({
    filePath: 'src/runtime/system.fixture.ts',
    packageName: '@vanity/fixture',
  }, () => {
    const system = staged.consolidate({ prefix: 'app', root: '#app' })
    void system.class
    return system
  }))
  return { ds, css, positive }
}

describe('mutable runtime', () => {
  it('throws small structured runtime diagnostics with stable codes and fixes', () => {
    const { ds } = createFixture()

    let invalidOptions: unknown
    try {
      ;(ds.runtime as any)('#app')
    }
    catch (error) {
      invalidOptions = error
    }
    expect(invalidOptions).toBeInstanceOf(VanityRuntimeError)
    expect(invalidOptions).toMatchObject({
      code: 'VANITY_RUNTIME_INVALID_OPTIONS',
      diagnostic: {
        code: 'VANITY_RUNTIME_INVALID_OPTIONS',
        path: ['options'],
        fix: expect.stringContaining('options object'),
      },
    })

    let unknownMode: unknown
    try {
      ds.runtime({ within: new MemoryRoot() }).axes.scheme.$switchTo('missing' as never)
    }
    catch (error) {
      unknownMode = error
    }
    expect(unknownMode).toBeInstanceOf(VanityRuntimeError)
    expect(unknownMode).toMatchObject({
      code: 'VANITY_RUNTIME_UNKNOWN_MODE',
      diagnostic: {
        code: 'VANITY_RUNTIME_UNKNOWN_MODE',
        axis: 'scheme',
        mode: 'missing',
        fix: expect.stringContaining('declared modes'),
      },
    })
  })

  it('resolves declared roots lazily, owns writes, binds ambiguity, and broadcasts unanimous axes', () => {
    const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
    const widget = open.defineTokens({
      pad: open.tdef.length({
        val: '1rem',
        mutable: true,
        axes: { scheme: { dark: '1.25rem' } },
      }),
    }).root('#widget')
    const ds = open
      .addTokens({
        brand: open.tdef.color({
          val: 'red',
          mutable: true,
          axes: { scheme: { dark: 'black' } },
        }),
        widget,
      })
      .consolidate({ prefix: 'multi', root: '#system' })
    const system = new MemoryRoot('#system')
    const firstWidget = new MemoryRoot('#widget')
    const secondWidget = new MemoryRoot('#widget')
    const scope = new MemoryScope()
    scope.add(system)
    scope.add(firstWidget)
    scope.add(secondWidget)

    const runtime = ds.runtime({ within: scope })
    expect(scope.queries).toBe(0)
    expect(() => (ds.runtime as any)(system)).toThrow(/runtime\(\{ within: element \}\)/)
    expect(() => (ds.runtime as any)('#system')).toThrow(/selector strings are not accepted/)

    runtime.t.brand.$set('rebeccapurple')
    expect(scope.queries).toBe(1)
    expect(system.style.values.size).toBe(1)
    expect(firstWidget.style.values.size).toBe(0)
    expect(() => runtime.t.widget.pad.$set('2rem')).toThrow(/matched 2 elements.*within.*bindRoot/)

    runtime.bindRoot('widget', firstWidget)
    runtime.t.widget.pad.$set('2rem')
    expect(firstWidget.style.values.size).toBe(1)
    expect(secondWidget.style.values.size).toBe(0)

    const replacementSystem = new MemoryRoot('#system')
    scope.roots.set('#system', [replacementSystem])
    runtime.refreshRoots('$system')
    runtime.t.brand.$set('purple')
    expect(replacementSystem.style.values.size).toBe(1)

    runtime.axes.scheme.$switchTo('dark')
    expect(replacementSystem.attributes.get('data-scheme')).toBe('dark')
    expect(firstWidget.attributes.get('data-scheme')).toBe('dark')
    expect(runtime.axes.scheme.$current()).toBe('dark')

    replacementSystem.attributes.set('data-scheme', 'light')
    expect(runtime.axes.scheme.$current()).toBeUndefined()
    expect(runtime.diagnostics).toContainEqual(expect.objectContaining({
      code: 'VANITY_RUNTIME_MODE_DISAGREEMENT',
      axis: 'scheme',
    }))

    expect(ds.runtimeProps(runtime.snapshot())).toMatchObject({
      $system: {
        style: expect.objectContaining(Object.fromEntries(replacementSystem.style.values)),
        attributes: { 'data-scheme': 'dark' },
      },
      widget: {
        style: expect.objectContaining(Object.fromEntries(firstWidget.style.values)),
        attributes: { 'data-scheme': 'dark' },
      },
    })

    const lateScope = new MemoryScope()
    lateScope.add(new MemoryRoot('#system'))
    const late = ds.runtime({ within: lateScope })
    late.axes.scheme.$switchTo('dark')
    const lateWidget = new MemoryRoot('#widget')
    lateScope.add(lateWidget)
    late.refreshRoots('widget')
    expect(lateWidget.attributes.get('data-scheme')).toBe('dark')
  })

  it('prevalidates a transaction before its first root write', () => {
    const positive = {
      '~standard': {
        version: 1 as const,
        vendor: 'runtime-transaction',
        validate: (input: unknown) => typeof input === 'number' && input > 0
          ? { value: input }
          : { issues: [{ message: 'positive only' }] },
      },
    }
    const open = createSystem()
    const widget = open.defineTokens({
      pad: open.tdef.length({ mutable: true }),
    }).root('#widget')
    const ds = open.addTokens({
      ratio: open.tdef.number({
        mutable: true,
        validate: {
          id: 'transaction-positive',
          schema: positive,
          runtime: 'always',
        },
      }),
      widget,
    }).consolidate({ prefix: 'atomic', root: '#system' })
    const system = new MemoryRoot('#system')
    const widgetRoot = new MemoryRoot('#widget')
    const scope = new MemoryScope()
    scope.add(system)
    scope.add(widgetRoot)
    const runtime = ds.runtime({ within: scope })

    expect(() => runtime.transaction((tx) => {
      tx.t.widget.pad.$set('2rem')
      tx.t.ratio.$set(-1)
    })).toThrow(/positive only/)
    expect(system.style.writes).toBe(0)
    expect(widgetRoot.style.writes).toBe(0)
    expect(runtime.snapshot().overrides).toEqual([])

    runtime.transaction((tx) => {
      tx.t.widget.pad.$set('2rem')
      tx.t.ratio.$set(2)
    })
    expect(system.style.writes).toBe(1)
    expect(widgetRoot.style.writes).toBe(1)
    expect(runtime.snapshot().overrides).toHaveLength(2)
  })

  it('resolves a scoped module from its authored scope start', () => {
    const open = createSystem()
    const widget = open.defineTokens({
      pad: open.tdef.length({ mutable: true }),
    }).root(scopeCondition('.widget'))
    const ds = open.addTokens({ widget })
      .consolidate({ prefix: 'scoped-runtime', root: '#system' })
    const system = new MemoryRoot('#system')
    const widgetRoot = new MemoryRoot('.widget')
    const scope = new MemoryScope()
    scope.add(system)
    scope.add(widgetRoot)
    const runtime = ds.runtime({ within: scope })

    runtime.t.widget.pad.$set('2rem')
    expect(widgetRoot.style.values.size).toBe(1)
    expect(runtime.inspect().roots).toContainEqual(expect.objectContaining({
      path: 'widget',
      selector: '.widget',
      status: 'resolved',
    }))
  })

  it('uses an explicit control adapter for otherwise non-activatable modes', () => {
    let activations = 0
    const open = createSystem().addAxis('contrast', {
      modes: {
        automatic: '@media (prefers-contrast: more)',
        calm: '@media (prefers-contrast: no-preference)',
      },
      control: {
        id: 'contrast-control',
        read: root => root.getAttribute?.('data-contrast') as 'automatic' | 'calm' | null ?? undefined,
        activate: (root, mode) => {
          activations++
          root.setAttribute('data-contrast', mode)
        },
        project: mode => ({ attributes: { 'data-contrast': mode } }),
      },
    })
    const ds = open.addTokens({
      ink: open.tdef.color({
        val: 'black',
        axes: { contrast: { automatic: 'CanvasText', calm: '#222' } },
      }),
    }).consolidate({ prefix: 'controlled', root: '#system' })
    const root = new MemoryRoot('#system')
    const runtime = ds.runtime({ within: root })

    const seed = ds.snapshotFrom(rt => rt.axes.contrast.$switchTo('calm'))
    expect(activations).toBe(0)
    expect(ds.runtimeProps(seed).$system!.attributes).toEqual({
      'data-contrast': 'calm',
    })

    runtime.axes.contrast.$switchTo('calm')
    expect(activations).toBe(1)
    expect(root.attributes.get('data-contrast')).toBe('calm')
    expect(runtime.axes.contrast.$current()).toBe('calm')
    expect(ds.runtimeProps(runtime.snapshot()).$system!.attributes).toEqual({
      'data-contrast': 'calm',
    })
    runtime.axes.contrast.automatic.$activate()
    expect(root.attributes.get('data-contrast')).toBe('automatic')

    root.attributes.set('data-contrast', 'invented')
    expect(runtime.axes.contrast.$current()).toBeUndefined()
    expect(runtime.diagnostics).toContainEqual(expect.objectContaining({
      code: 'VANITY_RUNTIME_UNKNOWN_MODE',
      axis: 'contrast',
      mode: 'invented',
    }))
  })

  it('activates direct thisMode and bare-root modes without parsing selectors', () => {
    const open = createSystem().addAxis('density', {
      modes: {
        cozy: '&',
        compact: thisMode,
      },
      default: 'cozy',
    })
    const ds = open.addTokens({
      space: open.tdef.length({
        val: '1rem',
        axes: { density: { cozy: '1rem', compact: '0.75rem' } },
      }),
    }).consolidate({ prefix: 'direct-axis', root: '#system' })
    const root = new MemoryRoot('#system')
    const runtime = ds.runtime({ within: root })

    expect(runtime.axes.density.$current()).toBe('cozy')
    runtime.axes.density.$cycle()
    expect(root.attributes.get('data-density')).toBe('compact')
    runtime.axes.density.$cycle()
    expect(root.attributes.has('data-density')).toBe(false)
    runtime.axes.density.$cycle({ exclude: ['cozy'] })
    expect(root.attributes.get('data-density')).toBe('compact')

    runtime.axes.density.$switchTo('compact')
    expect(root.attributes.get('data-density')).toBe('compact')
    runtime.axes.density.$switchTo('cozy')
    expect(root.attributes.has('data-density')).toBe(false)
  })

  it('projects a native scheme pin even without token-authored scheme branches', () => {
    const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'element' }))
    const ds = open
      .addTokens({
        color: {
          canvas: open.lightDark(
            open.oklch(0.98, 0, 0),
            open.oklch(0.14, 0, 0),
          ),
        },
      })
      .consolidate({ prefix: 'native', root: '#studio' })

    const seed = ds.snapshotFrom(runtime => runtime.axes.scheme.$switchTo('light'))
    expect(ds.runtimeProps(seed).$system!.attributes).toEqual({
      'data-scheme': 'light',
    })

    const root = new MemoryRoot('#studio')
    const runtime = ds.runtime({ within: root })
    runtime.hydrate(seed)
    expect(root.attributes.get('data-scheme')).toBe('light')
  })

  it('does not overstate activation for compound environmental conditions', () => {
    const open = createSystem().addAxis('compound', {
      modes: {
        anchored: systemRoot.and(data('state', 'anchored')),
        union: data('state', 'union').or(media('(width > 1px)')),
        gated: data('state', 'gated').and(media('(width > 1px)')),
        interactive: thisMode.and(selector('&:hover')),
      },
    })
    const ds = open.addTokens({
      value: open.tdef({
        axes: { compound: { anchored: 'a', union: 'u', gated: 'g', interactive: 'i' } },
      }),
    }).consolidate({ prefix: 'compound-axis', root: '#system' })
    const root = new MemoryRoot('#system')
    const runtime = ds.runtime({ within: root })

    runtime.axes.compound.$switchTo('anchored')
    expect(root.attributes.get('data-state')).toBe('anchored')
    runtime.axes.compound.$switchTo('union')
    expect(root.attributes.get('data-state')).toBe('union')
    expect(() => (runtime.axes.compound.$switchTo as (mode: string) => void)('gated'))
      .toThrow(/cannot activate mode 'gated'/)
    expect(() => (runtime.axes.compound.$switchTo as (mode: string) => void)('interactive'))
      .toThrow(/cannot activate mode 'interactive'/)
  })

  it('keeps generic custom-property writes explicit and provenance-free', () => {
    const root = new MemoryRoot()
    const external = customProperty('--external-space', { type: 'length' })
    const { ds } = createFixture()

    setCustomProperty(root, external, '2rem')
    setCustomProperty(root.style, ds.t.color.fixed, 'hotpink')
    setCustomProperties(root, {
      '--external-alpha': 0.6,
      '--external-motion': '180ms',
    })
    setCustomProperties(root, [[external, '3rem']])

    expect(root.style.values.get('--external-space')).toBe('3rem')
    expect(root.style.values.get(ds.t.color.fixed.$name)).toBe('hotpink')
    expect(root.style.values.get('--external-alpha')).toBe('0.6')
    expect(() => setCustomProperty(root as any, 'not-a-custom-property' as any, 'x')).toThrow(/valid CSS custom-property/)
    expect(() => (setCustomProperty as any)('#app', '--x', 'x')).toThrow(/explicit element/)
  })

  it('binds base, authored mode, and reserved case handles to opaque slots', () => {
    const { ds, css } = createFixture()
    const root = new MemoryRoot()
    const runtime = ds.runtime({ within: root })

    runtime.t.color.brand.$set('oklch(0.7 0.2 300)')
    runtime.t.color.brand.$axes.scheme.dark.$set('black')
    runtime.t.shadow.card.$case({ scheme: 'dark', density: 'compact' }).$set('none')
    runtime.transaction((tx) => {
      tx.t.space.control.$set('1.25rem')
      tx.t.shadow.card.$axes.density.compact.$set('0 3px 8px #0004')
    })

    const snapshot = runtime.snapshot()
    expect(snapshot.version).toBe(1)
    expect(snapshot.overrides.map(entry => [entry.token.join('.'), entry.address.kind])).toEqual([
      ['color.brand', 'base'],
      ['color.brand', 'axis'],
      ['shadow.card', 'axis'],
      ['shadow.card', 'case'],
      ['space.control', 'base'],
    ])
    expect(Object.keys(ds.runtimeStyle(snapshot).$system!)).toHaveLength(5)
    expect(Object.keys(ds.runtimeStyle(snapshot).$system!)).not.toContain(ds.t.color.brand.$name)
    expect(css).toContain('var(--app-v-')

    const before = runtime.snapshot().overrides.length
    runtime.t.color.brand.$axes.scheme.dark.$unset()
    expect(runtime.snapshot().overrides).toHaveLength(before - 1)
    expect(root.style.removals).toBe(1)
    expect((runtime.t.color.fixed as any).$set).toBeUndefined()
  })

  it('selects runtime-capable axis modes and projects them for SSR', () => {
    const { ds } = createFixture()
    const root = new MemoryRoot()
    const runtime = ds.runtime({ within: root })

    runtime.axes.density.$switchTo('compact')
    runtime.axes.scheme.$switchTo('dark')
    expect(root.attributes).toEqual(new Map([
      ['data-density', 'compact'],
      ['data-scheme', 'dark'],
    ]))

    runtime.axes.density.$switchTo('cozy')
    expect(root.attributes.has('data-density')).toBe(false)
    const snapshot = runtime.snapshot()
    expect(snapshot.modes).toEqual({ scheme: 'dark', density: 'cozy' })
    expect(ds.runtimeProps(snapshot)).toEqual({
      $system: {
        style: {},
        attributes: { 'data-scheme': 'dark' },
      },
    })

    runtime.axes.scheme.light.$activate()
    expect(root.attributes.get('data-scheme')).toBe('light')
  })

  it('builds a semantic snapshot seed without a DOM target', () => {
    const { ds } = createFixture()
    const seed = ds.snapshotFrom((runtime) => {
      runtime.t.color.brand.$set('rebeccapurple')
      runtime.t.color.brand.$axes.scheme.dark.$set(ds.t.color.brand)
      runtime.t.shadow.card.$case({ scheme: 'dark', density: 'compact' }).$set('none')
      runtime.axes.density.$switchTo('compact')
      runtime.axes.scheme.$switchTo('dark')
    })

    expect(seed.version).toBe(1)
    expect(seed.overrides).toEqual([
      expect.objectContaining({
        token: ['color', 'brand'],
        address: { kind: 'base' },
        val: 'rebeccapurple',
      }),
      expect.objectContaining({
        token: ['color', 'brand'],
        address: { kind: 'axis', axis: 'scheme', mode: 'dark' },
        val: 'var(--app-color-brand)',
      }),
      expect.objectContaining({
        token: ['shadow', 'card'],
        address: { kind: 'case', when: { scheme: 'dark', density: 'compact' } },
        val: 'none',
      }),
    ])
    expect(seed.modes).toEqual({ scheme: 'dark', density: 'compact' })
    expect(ds.runtimeProps(seed).$system!.attributes).toEqual({
      'data-scheme': 'dark',
      'data-density': 'compact',
    })

    expect(() => ds.snapshotFrom(runtime => runtime.t.ratio.$set(-1)))
      .toThrow(/expected a positive number/)
  })

  it('round-trips SSR state and hydrates without redundant DOM writes', () => {
    const { ds } = createFixture()
    const source = ds.runtime({ within: new MemoryRoot() })
    source.t.color.brand.$set('rebeccapurple')
    source.t.shadow.card.$axes.density.compact.$set('none')
    source.axes.scheme.$switchTo('dark')
    const snapshot = source.snapshot()
    const props = ds.runtimeProps(snapshot)

    const root = new MemoryRoot()
    for (const [name, value] of Object.entries(props.$system!.style))
      root.style.values.set(name, value)
    for (const [name, value] of Object.entries(props.$system!.attributes))
      root.attributes.set(name, value)

    const hydrated = ds.runtime({ within: root, initial: snapshot })
    expect(root.style.writes).toBe(0)
    expect(root.attributeWrites).toBe(0)
    expect(hydrated.snapshot()).toEqual(snapshot)
  })

  it('reconciles schema changes entry by entry and rejects protocol changes wholesale', () => {
    const first = createFixture().ds
    const old = first.runtime({ within: new MemoryRoot() })
    old.t.color.brand.$set('red')
    const prior = old.snapshot()

    const next = createFixture(true).ds
    expect(Object.keys(next.runtimeProps(prior).$system!.style)).toHaveLength(1)
    expect(Object.keys(next.runtimeProps(prior).$system!.style)[0]).toMatch(/^--app-v-/)
    const result = next.reconcileRuntimeSnapshot(prior)
    expect(result.snapshot.overrides).toHaveLength(1)
    expect(result.snapshot.system).not.toBe(prior.system)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'VANITY_RUNTIME_SCHEMA_MISMATCH' }))

    const removed: VanityRuntimeSnapshot = {
      ...prior,
      overrides: [...prior.overrides, {
        token: ['gone'],
        address: { kind: 'base' },
        val: 'red',
      }],
    }
    expect(next.reconcileRuntimeSnapshot(removed).diagnostics)
      .toContainEqual(expect.objectContaining({ code: 'VANITY_RUNTIME_UNKNOWN_TOKEN', token: ['gone'] }))
    const incompatible: VanityRuntimeSnapshot = {
      ...prior,
      overrides: [...prior.overrides, {
        token: ['color', 'brand'],
        address: { kind: 'axis', axis: 'scheme', mode: 'sepia' },
        val: 'red',
      }, {
        token: ['ratio'],
        address: { kind: 'base' },
        val: 'not-a-number',
      }],
      modes: { motion: 'none' },
    }
    const diagnostics = next.reconcileRuntimeSnapshot(incompatible).diagnostics
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'VANITY_RUNTIME_UNKNOWN_ADDRESS' }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'VANITY_RUNTIME_INVALID_VALUE', token: ['ratio'] }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'VANITY_RUNTIME_UNKNOWN_MODE', axis: 'motion' }))
    expect(() => next.reconcileRuntimeSnapshot({ ...prior, version: 2 })).toThrow(/unsupported runtime snapshot protocol/)
  })

  it('uses synchronous Standard Schema output and app-supplied schema registries', () => {
    const { ds, positive } = createFixture()
    const root = new MemoryRoot()
    const runtime = ds.runtime({ within: root })

    runtime.t.ratio.$set(1.26)
    expect(runtime.snapshot().overrides[0]?.val).toBe('1.3')
    expect(ds.reconcileRuntimeSnapshot(runtime.snapshot()).snapshot.overrides[0]?.val).toBe('1.3')
    expect(() => runtime.t.ratio.$set(-1)).toThrow(/positive number/)
    runtime.t.fallbackRatio.$set(-1)
    expect(runtime.snapshot().overrides.find(entry => entry.token.join('.') === 'fallbackRatio')?.val).toBe('1')
    const beforeOmit = runtime.snapshot().overrides.length
    runtime.t.optionalRatio.$set(-1)
    expect(runtime.snapshot().overrides).toHaveLength(beforeOmit)

    const restored = ds.runtime({
      within: new MemoryRoot(),
      validators: { 'positive-ratio': positive },
    })
    restored.t.ratio.$set(2)
    expect(restored.snapshot().overrides[0]?.val).toBe('2')

    const asyncSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'async-fixture',
        validate: async (input: unknown) => ({ value: input }),
      },
    }
    expect(() => ds.runtime({
      within: new MemoryRoot(),
      validators: { 'positive-ratio': asyncSchema },
    }).t.ratio.$set(1)).toThrow(/async.*synchronous/)
  })

  it('rebinds compatible HMR state by semantic address and supersedes stale controllers', () => {
    const root = new MemoryRoot()
    const first = createFixture().ds.runtime({ within: root })
    first.t.color.brand.$set('hotpink')
    first.axes.scheme.$switchTo('dark')

    const nextSystem = createFixture(true).ds
    const rebound = nextSystem.runtime({ within: root })
    expect(rebound.snapshot().overrides).toEqual([
      expect.objectContaining({ token: ['color', 'brand'], address: { kind: 'base' }, val: 'hotpink' }),
    ])
    expect(rebound.snapshot().modes).toEqual({ scheme: 'dark' })
    expect(rebound.diagnostics).toContainEqual(expect.objectContaining({ code: 'VANITY_RUNTIME_SCHEMA_MISMATCH' }))
    expect(() => first.t.color.brand.$set('red')).toThrow(/runtime binding .* same root/)
  })

  it('records runtime schema identity and opaque address provenance in inspection data', () => {
    const { records } = collectInspection(() => createFixture())
    const system = records.find(record => record.kind === 'system')
    const token = records.find(record => record.kind === 'token' && record.path === 'color.brand')
    expect(system).toMatchObject({
      kind: 'system',
      runtime: { protocol: 2, root: '#app', system: expect.stringMatching(/^vanity-runtime-2-/) },
    })
    expect(token).toMatchObject({
      kind: 'token',
      runtime: {
        type: 'color',
        addresses: [
          { address: { kind: 'base' }, slot: expect.stringMatching(/^--app-v-/) },
          { address: { kind: 'axis', axis: 'scheme', mode: 'dark' }, slot: expect.stringMatching(/^--app-v-/) },
          { address: { kind: 'axis', axis: 'scheme', mode: 'light' }, slot: expect.stringMatching(/^--app-v-/) },
        ],
      },
    })
    const manifest = buildManifest(records, '')
    expect(manifest.system.runtime.system).toMatch(/^vanity-runtime-2-/)
    expect(manifest.system.tokens['color.brand']?.runtime?.addresses).toHaveLength(3)
  })

  it('inspects semantic runtime overrides together with their concrete slot writes', () => {
    const { ds } = createFixture()
    const root = new MemoryRoot()
    const runtime = ds.runtime({ within: root })
    runtime.t.color.brand.$axes.scheme.dark.$set('rebeccapurple')
    runtime.axes.scheme.$switchTo('dark')

    expect(runtime.inspect()).toMatchObject({
      system: expect.stringMatching(/^vanity-runtime-2-/),
      root: '#app',
      active: true,
      modes: { scheme: 'dark' },
      overrides: [{
        token: ['color', 'brand'],
        address: { kind: 'axis', axis: 'scheme', mode: 'dark' },
        val: 'rebeccapurple',
        name: '--app-color-brand',
        slot: expect.stringMatching(/^--app-v-/),
        tokenRoot: '#app',
        applied: 'rebeccapurple',
      }],
    })
  })
})
