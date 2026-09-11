import type { VanityIntrospectedToken } from '../introspect/system'
import type { TokenGraph, VanityLeafDefinition } from './module'
import {
  colorSchemes,
  createSystem,
  data,
  media,
  oklch,
  time,
} from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { substrate } from '../substrate'
import { createAbsoluteAxisCondition, createAxisCondition } from '../system/axes'
import { getTokenGraph } from './module'
import { resolveGraph } from './resolve'

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

type AxisSelection = Readonly<Record<string, string>>

const AXIS_COMPOSITION_MATRIX = [
  { token: 'plainDouble', contributingAxes: [], shape: 'one token on no axes' },
  { token: 'schemeDouble', contributingAxes: ['scheme'], shape: 'one token on one axis' },
  { token: 'densityDouble', contributingAxes: ['density'], shape: 'one token on one axis' },
  { token: 'combinedDouble', contributingAxes: ['scheme', 'density'], shape: 'one token on several axes' },
  { token: 'sum', contributingAxes: ['scheme', 'density'], shape: 'several tokens on several axes' },
] as const

function axisModeProduct(graph: TokenGraph, axes: readonly string[]): readonly AxisSelection[] {
  let combinations: AxisSelection[] = [{}]
  for (const axis of graph.axes?.order ?? []) {
    if (!axes.includes(axis))
      continue
    const definition = graph.axes!.definitions[axis]!
    combinations = combinations.flatMap(when => definition.modeOrder
      .map((mode: string) => ({ ...when, [axis]: mode })))
  }
  return combinations
}

function selectAxisBranches(
  graph: TokenGraph,
  when: AxisSelection,
): Map<string, VanityLeafDefinition> {
  const substitutions = new Map<string, VanityLeafDefinition>()
  for (const node of graph.nodes.values()) {
    let selected: VanityLeafDefinition | undefined
    for (const axis of graph.axes?.order ?? []) {
      const mode = when[axis]
      if (mode === undefined)
        continue
      const branch = node.branches.find(candidate => candidate.kind === 'axis'
        && candidate.axis === axis
        && candidate.mode === mode)
      if (branch !== undefined)
        selected = branch.definition
    }
    if (selected !== undefined && selected.kind !== 'none')
      substitutions.set(node.key, selected)
  }
  return substitutions
}

function cascadeValue(
  token: VanityIntrospectedToken,
  graph: TokenGraph,
  when: AxisSelection,
): string {
  const base = token.declarations.find(declaration => declaration.kind === 'base')
  if (base === undefined)
    throw new Error(`${token.path.join('.')} has no base declaration`)
  let value = base.val

  for (const axis of graph.axes?.order ?? []) {
    const mode = when[axis]
    if (mode === undefined)
      continue
    const declaration = token.declarations
      .filter(candidate => candidate.kind === 'axis'
        && candidate.axis === axis
        && candidate.mode === mode)
      .at(-1)
    if (declaration !== undefined)
      value = declaration.val
  }

  for (const declaration of token.declarations) {
    if (declaration.kind !== 'case' || declaration.when === undefined)
      continue
    if (Object.entries(declaration.when).every(([axis, mode]) => when[axis] === mode))
      value = declaration.val
  }

  return String(value)
}

describe('axis and registration output', () => {
  it('re-resolves folded derivations under each axis mode while leaving live ones alone', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem().addAxis('scheme', colorSchemes())
      const module = open.defineTokens({
        color: {
          base: open.tdef.color({
            axes: { scheme: { light: 'white', dark: 'black' } },
          }),
        },
      }).add(m => ({
        color: {
          onBase: open.legibleOn(m.color.base),
          raised: open.oklch.from(m.color.base, { l: open.channel.add(0.05) }),
        },
      }))
      return emitSystem(open.addTokens(module).consolidate({ prefix: 'app' }))
    }))

    expect(css).toContain('--app-color-on-base: black;')
    expect(css).toContain('[data-scheme=\'dark\']')
    expect(css).toMatch(/\[data-scheme='dark'\][\s\S]*--app-color-on-base: white;/)
    expect(css).toContain('--app-color-raised: oklch(from var(--app-color-base)')
    expect(css.match(/--app-color-raised:/g)?.length).toBe(1)
  })

  it('re-resolves folded derivations under a non-scheme axis', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem().addAxis('density', {
        modes: {
          cozy: data('density', 'cozy'),
          compact: data('density', 'compact'),
        },
        default: 'cozy',
      })
      const module = open.defineTokens({
        color: {
          base: open.tdef.color({
            axes: { density: { cozy: 'white', compact: 'black' } },
          }),
        },
      }).add(m => ({
        color: { onBase: open.legibleOn(m.color.base) },
      }))
      return emitSystem(open.addTokens(module).consolidate({ prefix: 'app' }))
    }))

    expect(css).toContain('--app-color-on-base: black;')
    expect(css).toMatch(/\[data-density='compact'\][\s\S]*--app-color-on-base: white;/)
  })

  it('follows a named color-scheme mount through selectors and root synchronization', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem().addAxis('appearance', colorSchemes({ locality: 'root' }))
      return emitSystem(open.addTokens({
        color: {
          canvas: open.tdef.color({
            axes: { appearance: { light: 'white', dark: 'black' } },
          }),
        },
        signal: open.tdef({
          val: 'light-signal',
          axes: { appearance: { dark: 'dark-signal' } },
        }),
      }).consolidate({ prefix: 'app', root: '#studio' }))
    }))

    expect(css).toContain('light-dark(white, black)')
    expect(css).toContain(':is(#studio)[data-appearance=\'light\']')
    expect(css).toContain(':is(#studio)[data-appearance=\'dark\']')
    expect(css).toContain('[data-appearance=\'dark\']')
    expect(css).not.toContain('data-scheme')
  })

  it('re-resolves a value-only numeric derivation under an axis mode', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem().addAxis('density', {
        modes: {
          cozy: data('density', 'cozy'),
          compact: data('density', 'compact'),
        },
        default: 'cozy',
      })
      const module = open.defineTokens({
        scale: {
          base: open.tdef({
            val: 4,
            axes: { density: { cozy: 4, compact: 8 } },
          }),
        },
      }).add(m => ({
        scale: {
          double: open.tdef({
            val: open.calc(m.scale.base).multiply(2),
            reference: 'val',
            emit: true,
          }),
        },
      }))
      return emitSystem(open.addTokens(module).consolidate({ prefix: 'app' }))
    }))

    expect(css).toContain('--app-scale-double: 8;')
    expect(css).toMatch(/\[data-density='compact'\][\s\S]*--app-scale-double: 16;/)
  })

  it('emits folded intersections for dependencies that vary across two axes', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem()
        .addAxis('scheme', colorSchemes())
        .addAxis('density', {
          modes: {
            cozy: data('density', 'cozy'),
            compact: data('density', 'compact'),
          },
          default: 'cozy',
        })
      const module = open.defineTokens({
        color: {
          base: open.tdef.color({
            axes: {
              scheme: { light: '#ffffff', dark: '#000000' },
              density: { cozy: '#ffffff', compact: '#101010' },
            },
          }),
        },
      }).add(m => ({
        color: { onBase: open.legibleOn(m.color.base) },
      }))
      return emitSystem(open.addTokens(module).consolidate({ prefix: 'two' }))
    }))

    expect(css).toContain('@layer two.tokens.cases')
    expect(css).toMatch(/data-scheme='dark'[\s\S]*data-density='cozy'[\s\S]*--two-color-on-base: black;/)
    expect(css.match(/--two-color-on-base: black;/g)?.length).toBe(3)
  })

  it('checks every axis-combination cell against the composed CSS cascade', () => {
    const { returned: ds } = emit(() => inSystemScope(() => {
      const open = createSystem()
        .addAxis('scheme', colorSchemes())
        .addAxis('density', {
          modes: {
            cozy: data('density', 'cozy'),
            compact: data('density', 'compact'),
          },
          default: 'cozy',
        })
      const module = open.defineTokens({
        plain: open.tdef({ val: 5, reference: 'val' }),
        scheme: open.tdef({
          val: 1,
          axes: { scheme: { light: 1, dark: 2 } },
        }),
        density: open.tdef({
          val: 1,
          axes: { density: { cozy: 1, compact: 3 } },
        }),
        combined: open.tdef({
          val: 1,
          axes: {
            scheme: { light: 1, dark: 2 },
            density: { cozy: 1, compact: 3 },
          },
        }),
      }).add(m => ({
        plainDouble: open.tdef({
          val: open.calc(m.plain).multiply(2),
          reference: 'val',
          emit: true,
        }),
        schemeDouble: open.tdef({
          val: open.calc(m.scheme).multiply(2),
          reference: 'val',
          emit: true,
        }),
        densityDouble: open.tdef({
          val: open.calc(m.density).multiply(2),
          reference: 'val',
          emit: true,
        }),
        combinedDouble: open.tdef({
          val: open.calc(m.combined).multiply(2),
          reference: 'val',
          emit: true,
        }),
        sum: open.tdef({
          val: open.calc(m.scheme).add(m.density),
          reference: 'val',
          emit: true,
        }),
      }))
      return emitSystem(open.addTokens(module).consolidate({ prefix: 'matrix' }))
    }))

    const graph = getTokenGraph(ds.t)!
    const semantic = ds.introspect()

    for (const fixture of AXIS_COMPOSITION_MATRIX) {
      const token = semantic.tokens[fixture.token]!
      expect(token, `${fixture.shape}: ${fixture.token}`).toBeDefined()
      expect(token.axisCoverage?.contributingAxes ?? [], fixture.token)
        .toEqual(fixture.contributingAxes.length >= 2 ? fixture.contributingAxes : [])

      for (const when of axisModeProduct(graph, fixture.contributingAxes)) {
        const resolved = resolveGraph(
          { ...graph, results: new Map() },
          selectAxisBranches(graph, when),
        )
        expect(resolved.diagnostics, `${fixture.token} ${JSON.stringify(when)}`).toEqual([])
        expect(cascadeValue(token, graph, when), `${fixture.token} ${JSON.stringify(when)}`)
          .toBe(resolved.results.get(fixture.token)?.emitted)
      }
    }
  })

  it('keeps scheme color-agnostic while reserving light-dark() for colors', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem().addAxis('scheme', colorSchemes())
      const system = emitSystem(open.addTokens({
        duration: open.tdef({ val: time.ms(100), axes: { scheme: { dark: time.ms(180) } } }),
      }).consolidate())
      return system
    }))

    expect(css).not.toContain('light-dark(100ms')
    expect(css).toContain('--vanity-duration: 180ms')
    expect(css).toContain('[data-scheme=\'dark\']')
  })

  it('guards preference arms against the opposing explicit scheme for sparse non-color tokens', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
      return emitSystem(open.addTokens({
        signal: open.tdef({
          val: 'light-value',
          axes: { scheme: { dark: 'dark-value' } },
        }),
      }).consolidate({ root: '#fixture' }))
    }))

    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(':is(#fixture):where(:not([data-scheme=\'light\'], [data-scheme=\'light\'] *))')
    expect(css).toContain(':is(#fixture):where([data-scheme=\'dark\'], [data-scheme=\'dark\'] *)')
    expect(css).not.toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*#fixture\s*\{/)
  })

  it('gives explicit scheme choices enough specificity to override an id root', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem().addAxis('scheme', colorSchemes())
      return emitSystem(open.addTokens({
        canvas: open.tdef.color({
          axes: { scheme: { light: oklch(0.98, 0, 0), dark: oklch(0.16, 0, 0) } },
        }),
      }).consolidate({ root: '#prism-studio' }))
    }))

    expect(css).toContain(':is(#prism-studio)[data-scheme=\'light\']')
    expect(css).toContain(':is(#prism-studio)[data-scheme=\'dark\']')
    expect(css).not.toMatch(/(^|\n)\[data-scheme='(?:light|dark)'\]/)
  })

  it('emits deterministic base, ordered axis, case, and registration layers', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem()
        .addAxis('scheme', colorSchemes({ locality: 'root' }))
        .addAxis('density', {
          modes: {
            cozy: data('density', 'cozy'),
            compact: data('density', 'compact'),
          },
          default: 'cozy',
        })
      return emitSystem(open.addTokens({
        color: {
          accent: open.tdef.color({
            axes: { scheme: { light: 'white', dark: 'black' } },
            register: { syntax: '*', inherits: true },
          }),
        },
        shadow: {
          card: open.tdef({
            val: '0 2px 8px rgb(0 0 0 / .16)',
            axes: {
              scheme: { dark: '0 2px 8px rgb(0 0 0 / .6)' },
              density: { compact: '0 1px 2px rgb(0 0 0 / .2)' },
            },
            cases: [{
              when: { scheme: 'dark', density: 'compact' },
              val: '0 1px 2px rgb(0 0 0 / .7)',
            }],
          }),
        },
      }).consolidate({ prefix: 'app' }))
    }))

    expect(css).toContain('@property --app-color-accent')
    expect(css).toContain('syntax: "*";')
    expect(css).toContain('@layer app.tokens.base')
    expect(css).toContain('@layer app.tokens.axes.scheme')
    expect(css).toContain('@layer app.tokens.axes.density')
    expect(css).toContain('@layer app.tokens.cases')
    expect(css).not.toContain('@layer app.tokens.overrides')
    expect(css.indexOf('@layer app.tokens.base')).toBeLessThan(css.indexOf('@layer app.tokens.axes.scheme'))
    expect(css.indexOf('@layer app.tokens.axes.scheme')).toBeLessThan(css.indexOf('@layer app.tokens.axes.density'))
    expect(css.indexOf('@layer app.tokens.axes.density')).toBeLessThan(css.indexOf('@layer app.tokens.cases'))
    expect(css).toContain('light-dark(white, black)')
    expect(css).toContain('[data-scheme=\'dark\']')
    expect(css).toContain('[data-density=\'compact\']')
    expect(css).toContain('0 1px 2px rgb(0 0 0 / .7)')
  })

  it('emits opaque mutable slots and null-branch fallback chains without cycles', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem().addAxis('scheme', colorSchemes())
      return emitSystem(open.addTokens({
        color: {
          accent: open.tdef({
            val: oklch(1, 0, 0),
            mutable: true,
            axes: { scheme: { light: oklch(1, 0, 0), dark: null } },
          }),
        },
      }).consolidate({ prefix: 'app' }))
    }))

    expect(css).toMatch(/--app-v-[a-z0-9]+: oklch\(1 0 0\);/)
    expect(css).toMatch(/light-dark\(var\(--app-v-[a-z0-9]+, var\(--app-v-[a-z0-9]+\)\), var\(--app-v-[a-z0-9]+, var\(--app-v-[a-z0-9]+\)\)\)/)
    expect(css).not.toMatch(/--app-color-accent:\s*var\(--app-color-accent/)
  })

  it('emits every root placement and at-rule mechanism against the effective root', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem()
        .addAxis('self', { modes: { on: createAxisCondition('[data-self=on]') } })
        .addAxis('ancestor', { modes: { on: createAxisCondition('[data-ancestor=on]', { on: 'ancestor' }) } })
        .addAxis('descendant', { modes: { on: createAxisCondition('[data-descendant=on]', { on: 'descendant' }) } })
        .addAxis('print', { modes: { on: media('print') } })
        .addAxis('portal', { modes: { on: createAbsoluteAxisCondition('#portal[data-on]') } })
      return emitSystem(open.addTokens({
        signal: open.tdef({
          val: 'base',
          axes: {
            self: { on: 'self' },
            ancestor: { on: 'ancestor' },
            descendant: { on: 'descendant' },
            print: { on: 'print' },
            portal: { on: 'portal' },
          },
        }),
      }).consolidate({ root: '#widget' }))
    }))

    expect(css).toContain(':is(#widget)[data-self=on]')
    expect(css).toContain('[data-ancestor=on] :is(#widget)')
    expect(css).toContain(':is(#widget) [data-descendant=on]')
    expect(css).toContain('@media print')
    expect(css).toContain('#portal[data-on]')
    expect(css).not.toContain('--vanity-v-')
  })

  it('uses @property initial-value as the default of a mutable base reservation', () => {
    const { css } = emit(() => inSystemScope(() => {
      const open = createSystem()
      return emitSystem(open.addTokens({
        fill: open.tdef.color({
          mutable: true,
          register: { initialVal: 'rebeccapurple' },
        }),
      }).consolidate({ prefix: 'app' }))
    }))

    expect(css).toContain('@property --app-fill')
    expect(css).toContain('initial-value: rebeccapurple;')
    const slot = css.match(/--app-fill:\s*var\((--app-v-[a-z0-9]+)\)/)?.[1]
    expect(slot).toBeDefined()
    expect(css).not.toContain(`${slot}:`)
  })
})
