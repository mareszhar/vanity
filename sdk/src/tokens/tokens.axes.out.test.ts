import { emit } from '@test'
import { createEngine } from '@test/legacy'
import { describe, expect, it } from 'vitest'

describe('axis and registration output', () => {
  it('keeps scheme color-agnostic while reserving light-dark() for colors', () => {
    const de = createEngine().axes(({ scheme }) => ({ scheme: scheme() }))
    const { css } = emit(() => de.createSystem({
      tokens: {
        duration: de.token({ val: de.time.ms(100), axes: { scheme: { dark: de.time.ms(180) } } }),
      },
    }))

    expect(css).not.toContain('light-dark(100ms')
    expect(css).toContain('--vanity-duration: 180ms')
    expect(css).toContain('[data-scheme=\'dark\']')
  })

  it('guards preference arms against the opposing explicit scheme for sparse non-color tokens', () => {
    const de = createEngine().axes(({ scheme }) => ({ scheme: scheme({ locality: 'root' }) }))
    const { css } = emit(() => de.createSystem({
      root: '#fixture',
      tokens: {
        signal: de.token({
          val: 'light-value',
          axes: { scheme: { dark: 'dark-value' } },
        }),
      },
    }))

    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(':is(#fixture):where(:not([data-scheme=\'light\'], [data-scheme=\'light\'] *))')
    expect(css).toContain(':is(#fixture):where([data-scheme=\'dark\'], [data-scheme=\'dark\'] *)')
    expect(css).not.toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*#fixture\s*\{/)
  })

  it('gives explicit scheme choices enough specificity to override an id root', () => {
    const de = createEngine().axes(({ scheme }) => ({ scheme: scheme() }))
    const { css } = emit(() => de.createSystem({
      root: '#prism-studio',
      tokens: {
        canvas: de.token.color({
          axes: { scheme: { light: de.oklch(0.98, 0, 0), dark: de.oklch(0.16, 0, 0) } },
        }),
      },
    }))

    expect(css).toContain(':is(#prism-studio)[data-scheme=\'light\']')
    expect(css).toContain(':is(#prism-studio)[data-scheme=\'dark\']')
    expect(css).not.toMatch(/(^|\n)\[data-scheme='(?:light|dark)'\]/)
  })

  it('emits deterministic base, ordered axis, case, and registration layers', () => {
    const de = createEngine()
      .axes(({ axis, data, scheme }) => ({
        scheme: scheme({ locality: 'root' }),
        density: axis({
          modes: {
            cozy: data('density', 'cozy'),
            compact: data('density', 'compact'),
          },
          default: 'cozy',
        }),
      }))
    const { css } = emit(() => de.createSystem({
      prefix: 'app',
      tokens: {
        color: {
          accent: de.token.color({
            axes: { scheme: { light: 'white', dark: 'black' } },
            register: { syntax: '*', inherits: true },
          }),
        },
        shadow: {
          card: de.token({
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
      },
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
    const de = createEngine().axes(({ scheme }) => ({ scheme: scheme() }))
    const { css } = emit(() => de.createSystem({
      prefix: 'app',
      tokens: {
        color: {
          accent: de.token({
            val: de.oklch(1, 0, 0),
            mutable: true,
            axes: { scheme: { light: de.oklch(1, 0, 0), dark: null } },
          }),
        },
      },
    }))

    expect(css).toMatch(/--app-v-[a-z0-9]+: oklch\(1 0 0\);/)
    expect(css).toMatch(/light-dark\(var\(--app-v-[a-z0-9]+, var\(--app-v-[a-z0-9]+\)\), var\(--app-v-[a-z0-9]+, var\(--app-v-[a-z0-9]+\)\)\)/)
    expect(css).not.toMatch(/--app-color-accent:\s*var\(--app-color-accent/)
  })

  it('emits every root placement and at-rule mechanism against the effective root', () => {
    const de = createEngine().axes(({ absoluteCondition, axis, condition, media }) => ({
      self: axis({ modes: { on: condition('[data-self=on]') } }),
      ancestor: axis({ modes: { on: condition('[data-ancestor=on]', { on: 'ancestor' }) } }),
      descendant: axis({ modes: { on: condition('[data-descendant=on]', { on: 'descendant' }) } }),
      print: axis({ modes: { on: condition(media('print')) } }),
      portal: axis({ modes: { on: absoluteCondition('#portal[data-on]') } }),
    }))
    const { css } = emit(() => de.createSystem({
      root: '#widget',
      tokens: {
        signal: de.token({
          val: 'base',
          axes: {
            self: { on: 'self' },
            ancestor: { on: 'ancestor' },
            descendant: { on: 'descendant' },
            print: { on: 'print' },
            portal: { on: 'portal' },
          },
        }),
      },
    }))

    expect(css).toContain(':is(#widget)[data-self=on]')
    expect(css).toContain('[data-ancestor=on] :is(#widget)')
    expect(css).toContain(':is(#widget) [data-descendant=on]')
    expect(css).toContain('@media print')
    expect(css).toContain('#portal[data-on]')
    expect(css).not.toContain('--vanity-v-')
  })

  it('uses @property initial-value as the default of a mutable base reservation', () => {
    const de = createEngine()
    const { css } = emit(() => de.createSystem({
      prefix: 'app',
      tokens: {
        fill: de.token.color({
          mutable: true,
          register: { initialVal: 'rebeccapurple' },
        }),
      },
    }))

    expect(css).toContain('@property --app-fill')
    expect(css).toContain('initial-value: rebeccapurple;')
    const slot = css.match(/--app-fill:\s*var\((--app-v-[a-z0-9]+)\)/)?.[1]
    expect(slot).toBeDefined()
    expect(css).not.toContain(`${slot}:`)
  })
})
