import {
  createSystem,
  data,
  moduleRoot,
  scope,
  systemRoot,
} from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('unified token output', () => {
  it('preserves logical token values and chained relative-channel expressions', () => {
    const open = createSystem()
      .addTokens(current => ({
        control: {
          minL: current.tdef.number({ val: 0.18, mutable: true }),
          maxL: current.tdef.number({ val: 0.92, mutable: true }),
          pivot: current.tdef.number({ val: 0.5, mutable: true }),
          chroma: current.tdef.number({ val: 0.14, mutable: true }),
          hue: current.tdef.number({ val: 285, mutable: true }),
        },
      }))
      .addTokens(current => ({
        color: {
          brand: current.oklch(
            current.calc(current.t.control.minL).add(
              current.calc(current.t.control.maxL)
                .subtract(current.t.control.minL)
                .multiply(current.calc(0.3).add(0.4)),
            ),
            current.t.control.chroma,
            current.t.control.hue,
          ),
        },
      }))
      .addTokens(current => ({
        color: {
          shifted: current.oklch.from(current.t.color.brand, {
            l: current.channel.subtract(current.t.control.pivot).multiply(-1000),
            alpha: current.calc(current.t.control.maxL).subtract(current.t.control.minL),
          }),
        },
      }))

    const ds = open.consolidate({ prefix: 'value-law' })
    const { css } = emit(() => ds.class({
      color: ds.t.color.shifted,
      backgroundColor: ds.t.color.brand,
    }))

    expect(css).toContain(
      'oklch(calc(var(--value-law-control-min-l) + (var(--value-law-control-max-l) - var(--value-law-control-min-l)) * 0.7) var(--value-law-control-chroma) var(--value-law-control-hue))',
    )
    expect(css).toContain(
      'oklch(from var(--value-law-color-brand) calc((l - var(--value-law-control-pivot)) * -1000) c h / calc(var(--value-law-control-max-l) - var(--value-law-control-min-l)))',
    )
    expect(css).not.toContain('[object Object]')
    expect(css).not.toContain('--vanity-open-')
  })

  it('preserves nested module roots, system-root escapes, and scoped roots', () => {
    const open = createSystem()
    const inner = open.defineTokens({ value: 'blue' }).root('#inner')
    const scoped = open.defineTokens({ value: 'red' }).root(scope('.widget'))
    const escaped = open.defineTokens({ value: 'green' }).root(systemRoot)
    const module = open.defineTokens({
      outer: 'black',
      inner,
      scoped,
      escaped,
    }).root('#outer')
    const ds = open.addTokens(module).consolidate({
      prefix: 'rooted',
      root: '#system',
    })
    const { css } = emit(() =>
      ds.class({
        color: ds.t.outer,
      }),
    )

    expect(css).toContain('#outer')
    expect(css).toContain('#inner')
    expect(css).toContain('#system')
    expect(css).toContain('@scope (.widget)')
    expect(css).toContain(':scope')
    expect(css).toContain('--rooted-inner-value: blue')
    expect(css).toContain('--rooted-scoped-value: red')
    expect(css).toContain('--rooted-escaped-value: green')
  })

  it('resolves axis anchors against the system and nearest module roots', () => {
    const open = createSystem().addAxis('placement', {
      modes: {
        global: systemRoot.and(data('placement', 'global')),
        local: moduleRoot.and(data('placement', 'local')),
      },
      default: 'local',
    })
    const module = open.defineTokens({
      value: open.tdef({
        val: 'base',
        axes: {
          placement: {
            global: 'global',
            local: 'local',
          },
        },
      }),
    }).root('#module')
    const ds = open.addTokens(module).consolidate({
      prefix: 'anchored',
      root: '#system',
    })
    const { css } = emit(() => ds.class({ color: ds.t.value }))

    expect(css).toContain(':is(#system)[data-placement=\'global\']')
    expect(css).toContain(':is(#module)[data-placement=\'local\']')
  })
})
