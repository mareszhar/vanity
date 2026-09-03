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

describe('axis and registration output', () => {
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
