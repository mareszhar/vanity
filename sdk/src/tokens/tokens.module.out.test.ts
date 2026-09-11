import { hail } from '@mszr/vanity/presets'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createSystem, VanityError } from '../index'
import { collectInspection } from '../introspect/records'
import { substrate } from '../substrate'
import { getTokenGraph } from './module'
import { resolveGraph } from './resolve'

describe('token-module output', () => {
  it('emits only declared public properties and living standards expressions', () => {
    const { css } = emit(() => substrate.modules.runInFileScope({
      filePath: 'src/tokens/tokens.module.system.ts',
      packageName: '@vanity/fixture',
    }, () => {
      const open = createSystem()
      const module = open.defineTokens({
        color: {
          brand: open.oklch(0.58, 0.2, 285),
          compileOnly: open.tdef({ val: open.oklch(0.4, 0.1, 120), reference: 'val', emit: false }),
        },
        future: open.tdef.length(),
      }).add(m => ({
        color: {
          brandSoft: open.alpha(m.color.brand, 0.12),
          compileOnlySoft: open.alpha(m.color.compileOnly, 0.2),
        },
      }))
      const system = open.addTokens(module).consolidate({ prefix: 'app' })
      void system.class
      return system
    }))

    expect(css).toContain('--app-color-brand: oklch(0.58 0.2 285);')
    expect(css).toContain('--app-color-brand-soft: oklch(from var(--app-color-brand) l c h / 0.12);')
    expect(css).toContain('--app-color-compile-only-soft: oklch(0.4 0.1 120 / 0.2);')
    expect(css).not.toContain('--app-color-compile-only:')
    expect(css).not.toContain('--app-future:')
    expect(css).not.toContain('undefined')
  })

  it('preserves authored color leaves in token and declaration positions', () => {
    const { css } = emit(() => substrate.modules.runInFileScope({
      filePath: 'src/tokens/tokens.module.colors.system.ts',
      packageName: '@vanity/fixture',
    }, () => {
      const open = createSystem()
      const authored = {
        parse: open.color('blue'),
        hex: open.color('#ff0000'),
        rgb: open.rgb(1, 0, 0),
        hsl: open.hsl(200, 50, 50),
        hwb: open.hwb(200, 50, 50),
        lab: open.lab(50, 20, 30),
        lch: open.lch(50, 20, 30),
        oklab: open.oklab(0.5, 0.1, 0.2),
        p3: open.color('display-p3', 0.5, 0.1, 0.1),
      }
      const ds = open.addTokens({ color: authored }).consolidate({ prefix: 'native' })
      ds.class({
        color: authored.parse,
        backgroundColor: authored.hex,
        borderColor: authored.rgb,
        outlineColor: authored.hsl,
        accentColor: authored.hwb,
        caretColor: authored.lab,
        fill: authored.lch,
        stroke: authored.oklab,
        textDecorationColor: authored.p3,
      }, 'native-colors')
      return ds
    }))

    for (const value of [
      '--native-color-parse: blue',
      '--native-color-hex: #ff0000',
      '--native-color-rgb: rgb(1 0 0)',
      '--native-color-hsl: hsl(200 50% 50%)',
      '--native-color-hwb: hwb(200 50% 50%)',
      '--native-color-lab: lab(50 20 30)',
      '--native-color-lch: lch(50 20 30)',
      '--native-color-oklab: oklab(0.5 0.1 0.2)',
      '--native-color-p3: color(display-p3 0.5 0.1 0.1)',
    ]) {
      expect(css).toContain(value)
    }

    expect(css).toContain('color: blue;')
    expect(css).toContain('background-color: #ff0000;')
    expect(css).toContain('border-color: rgb(1 0 0);')
    expect(css).toContain('outline-color: hsl(200 50% 50%);')
    expect(css).toContain('accent-color: hwb(200 50% 50%);')
    expect(css).toContain('caret-color: lab(50 20 30);')
    expect(css).toContain('fill: lch(50 20 30);')
    expect(css).toContain('stroke: oklab(0.5 0.1 0.2);')
    expect(css).toContain('text-decoration-color: color(display-p3 0.5 0.1 0.1);')
  })

  it('preserves a wide-gamut origin while computed color chains still fold', () => {
    const { css } = emit(() => substrate.modules.runInFileScope({
      filePath: 'src/tokens/tokens.module.color-chains.system.ts',
      packageName: '@vanity/fixture',
    }, () => {
      const open = createSystem()
      const p3 = open.color('display-p3', 0.5, 0.1, 0.1)
      const ds = open.addTokens({
        color: {
          origin: p3,
          p3Alpha: open.alpha(p3, 0.2),
          hslAlpha: open.alpha(open.hsl(200, 50, 50), 0.2),
          adjusted: open.oklch.lighten(open.oklch(0.5, 0.1, 30), 0.1),
          wideAdjusted: open.oklch.lighten(p3, 0.1),
          hslCrossAdjusted: open.hsl.lighten(open.oklch(0.5, 0.1, 30), 0.1),
          lchCrossAdjusted: open.lch.saturate(open.rgb(10, 20, 30), 0.1),
          hslAdjusted: open.hsl.lighten(open.hsl(200, 50, 50), 0.1),
          wideHslAdjusted: open.hsl.rotate(open.color('display-p3', 1, 0, 0), 30),
          wideHwbAdjusted: open.hwb.rotate(open.color('display-p3', 1, 0, 0), 30),
          mixed: open.colorMix([open.color('red'), open.color('blue')]).in('oklab'),
          onWhite: open.legibleOn(open.color('white')),
          relative: open.hsl.from(p3, { l: 50 }),
        },
      }).consolidate({ prefix: 'chains' })
      void ds.class
      return ds
    }))

    expect(css).toContain('--chains-color-origin: color(display-p3 0.5 0.1 0.1);')
    expect(css).toContain('--chains-color-p3-alpha: color(display-p3 0.5 0.1 0.1 / 0.2);')
    expect(css).toContain('--chains-color-hsl-alpha: hsl(200 50% 50% / 0.2);')
    expect(css).toContain('--chains-color-relative: hsl(from color(display-p3 0.5 0.1 0.1) h s 50);')
    expect(css).toMatch(/--chains-color-adjusted: oklch\(/)
    expect(css).toMatch(/--chains-color-wide-adjusted: oklch\(/)
    expect(css).not.toContain('--chains-color-wide-adjusted: oklch(from')
    expect(css).toMatch(/--chains-color-hsl-cross-adjusted: hsl\(/)
    expect(css).not.toContain('--chains-color-hsl-cross-adjusted: hsl(from')
    expect(css).toMatch(/--chains-color-lch-cross-adjusted: lch\(/)
    expect(css).not.toContain('--chains-color-lch-cross-adjusted: lch(from')
    expect(css).toContain('--chains-color-hsl-adjusted: hsl(200 50% 50.1%);')
    expect(css).toContain('--chains-color-wide-hsl-adjusted: hsl(from color(display-p3 1 0 0) calc(h + 30) s l);')
    expect(css).toContain('--chains-color-wide-hwb-adjusted: hwb(from color(display-p3 1 0 0) calc(h + 30) w b);')
    expect(css).toMatch(/--chains-color-mixed: oklch\(/)
    expect(css).toContain('--chains-color-on-white: black;')
  })

  it('derives live legibleOn fallbacks from authored defaults without coupling them to a scheme', () => {
    const open = createSystem().addPlugin(hail({ color: { elevation: true } }))
    const ds = open.addTokens({
      color: open.defineTokens({
        hue: open.tdef.number({ val: 275, mutable: true, register: true }),
        whole: open.tdef.color({ val: open.oklch(0.6, 0.15, 275), mutable: true }),
        liveBrand: open.tdef.color({ val: open.oklch(0.58, 0.2, 285), mutable: true }),
      })
        .add(m => ({
          channeled: open.oklch(0.6, 0.15, m.hue),
          elevated: open.oklchx.from(m.liveBrand, { e: 0.2 }),
        }))
        .add(m => ({
          onWhole: open.legibleOn(m.whole),
          onChanneled: open.legibleOn(m.channeled),
          onElevated: open.legibleOn(m.elevated),
        })),
    }).consolidate({ prefix: 'app' })
    const { result: { css } } = collectInspection(() =>
      emit(() => {
        void ds.class
        return ds
      }))

    expect(css).toMatch(/--app-color-on-whole:\s*(?:black|white);/)
    expect(css).toMatch(/--app-color-on-channeled:\s*(?:black|white);/)
    expect(css).toMatch(/--app-color-on-elevated:\s*(?:black|white|light-dark\(black, white\)|light-dark\(white, black\));/)
    expect(css).toContain('--app-color-channeled: oklch(0.6 0.15 var(--app-color-hue))')
    expect(css).toContain('--app-color-elevated: oklch(from')
    expect(css).not.toContain('contrast-color(')
    expect(css).toContain('var(--app-color-live-brand)')
  })

  it('degrades legibleOn to an explained representative for valid unfoldable mixes', () => {
    const open = createSystem()
    const { records, result } = collectInspection(() => emit(() => {
      const ds = substrate.modules.runInFileScope({
        filePath: 'src/tokens/tokens.module.fallback.system.ts',
        packageName: '@vanity/fixture',
      }, () => open.addTokens({
        color: {
          omitted: open.legibleOn(open.colorMix(['white', ['red', 25]]).in('oklab')),
          explicit: open.legibleOn(open.colorMix([['white', 75], ['red', 25]]).in('oklab')),
          oklch: open.legibleOn(open.colorMix(['white', 'red']).in('oklch')),
          srgb: open.legibleOn(open.colorMix(['white', 'red']).in('srgb')),
        },
      }).consolidate({ prefix: 'fallback' }))
      void ds.class
      return ds
    }))

    expect(result.css).toMatch(/--fallback-color-(omitted|explicit): (?:black|white);/)
    expect(result.css).toMatch(/--fallback-color-oklch: (?:black|white);/)
    expect(result.css).toMatch(/--fallback-color-srgb: (?:black|white);/)

    const oklch = records.find(record => record.kind === 'token' && record.path === 'color.oklch')
    expect(oklch).toMatchObject({
      kind: 'token',
      semantic: {
        fold: {
          status: 'folded',
          reason: expect.stringContaining('representative approximation'),
        },
        expression: {
          detail: { fallback: expect.stringContaining('representative approximation') },
        },
      },
    })
  })

  it('carries the legibleOn approximation through referenced color expressions', () => {
    const open = createSystem()
    const { records, result } = collectInspection(() => emit(() => {
      const ds = substrate.modules.runInFileScope({
        filePath: 'src/tokens/tokens.module.referenced-fallback.system.ts',
        packageName: '@vanity/fixture',
      }, () => {
        return open.addTokens(
          open.defineTokens({
            color: {
              a: open.tdef({ val: open.color('white') }),
              b: open.tdef({ val: open.color('red') }),
            },
          })
            .add(m => ({
              color: {
                oklchMix: open.colorMix([m.color.a, m.color.b]).in('oklch'),
                hueMix: open.colorMix([m.color.a, m.color.b]).in('oklch', { hue: 'longer' }),
                partialMix: open.colorMix([[m.color.a, 30], [m.color.b, 30]]).in('oklab'),
                inlineOklch: open.legibleOn(open.colorMix([m.color.a, m.color.b]).in('oklch')),
                inlineHue: open.legibleOn(open.colorMix([m.color.a, m.color.b]).in('oklch', { hue: 'longer' })),
                inlinePartial: open.legibleOn(open.colorMix([[m.color.a, 30], [m.color.b, 30]]).in('oklab')),
              },
            }))
            .add(m => ({
              color: {
                referencedOklch: open.legibleOn(m.color.oklchMix),
                referencedHue: open.legibleOn(m.color.hueMix),
                referencedPartial: open.legibleOn(m.color.partialMix),
              },
            })),
        ).consolidate({ prefix: 'referenced-fallback' })
      })
      void ds.class
      return ds
    }))

    const valueOf = (name: string): string => {
      const match = result.css.match(new RegExp(`--referenced-fallback-color-${name}: ([^;]+);`))
      expect(match, `expected ${name} to be emitted`).not.toBeNull()
      return match![1]!
    }

    for (const name of ['oklch', 'hue', 'partial'] as const) {
      expect(valueOf(`inline-${name}`)).toMatch(/^(?:black|white)$/)
      expect(valueOf(`referenced-${name}`)).toBe(valueOf(`inline-${name}`))
    }

    for (const name of ['referencedOklch', 'referencedHue', 'referencedPartial']) {
      const record = records.find(candidate => candidate.kind === 'token' && candidate.path === `color.${name}`)
      expect(record).toMatchObject({
        kind: 'token',
        path: `color.${name}`,
        semantic: {
          fold: {
            status: 'folded',
            reason: expect.stringContaining('representative approximation'),
          },
          expression: {
            detail: { fallback: expect.stringContaining('representative approximation') },
          },
        },
      })
    }
  })

  it('returns a structured diagnostic when a live target has no authored representative', () => {
    const { open, module } = (() => {
      const system = createSystem()
      return {
        open: system,
        module: system.defineTokens({
          color: {
            onExternal: system.legibleOn(system.oklch(0.6, 0.15, { var: 'var(--external-hue)' })),
          },
        }),
      }
    })()

    try {
      emit(() => substrate.modules.runInFileScope({
        filePath: 'src/tokens/tokens.module.system.ts',
        packageName: '@vanity/fixture',
      }, () => open.addTokens(module).consolidate()))
      throw new Error('expected the token module to reject the external live channel')
    }
    catch (error) {
      expect(error).toBeInstanceOf(VanityError)
      const diagnostic = (error as VanityError).diagnostics[0]
      expect(diagnostic).toMatchObject({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        path: ['color', 'onExternal'],
        fix: { message: 'give it a color value, or reference a color token' },
      })
      expect(diagnostic.message).toContain('no authored default value')
    }
  })

  it('reports a cycle when a contrast target crosses a cyclic reference edge', () => {
    const open = createSystem()
    const ds = open.addTokens({
      color: {
        first: open.legibleOn('white'),
        second: open.legibleOn('black'),
      },
    }).consolidate({ prefix: 'contrast-cycle' })
    const graph = getTokenGraph(ds.t)!
    const first = graph.nodes.get('color.first')!
    const second = graph.nodes.get('color.second')!

    first.definition = { kind: 'color', expr: { kind: 'ref', handle: second.handle } }
    second.definition = {
      kind: 'contrast',
      expr: {
        kind: 'contrast',
        target: { kind: 'ref', handle: first.handle },
        contrast: 60,
        explicitContrast: false,
      },
    }

    expect(() => resolveGraph({ ...graph, results: new Map() })).toThrow(/token derivation cycle/)
  })

  it('keeps invalid non-colors as invalid-color diagnostics', () => {
    const open = createSystem()

    expect(() => open.addTokens({
      color: { invalid: open.legibleOn('not-a-color') },
    }).consolidate()).toThrow(/not-a-color.*is not a color/)

    expect(() => open.addTokens(
      open.defineTokens({ color: { invalid: open.tdef({ val: 'not-a-color' as any }) } })
        .add(m => ({ color: { referenced: open.legibleOn(m.color.invalid as any) } })),
    ).consolidate()).toThrow(/not-a-color.*is not a color/)
  })

  it('keeps missing color-mix interpolation-space diagnostics local to the cause', () => {
    const open = createSystem()
    const fix = 'choose an interpolation space with `.in(space)`, or declare `policies.color.mixSpace`'
    const expectMissingSpace = (run: () => unknown) => {
      let error: VanityError | undefined
      try {
        run()
      }
      catch (caught) {
        error = caught as VanityError
      }
      expect(error).toBeInstanceOf(VanityError)
      expect(error?.diagnostics[0]?.message).toContain('colorMix() needs an interpolation space; choose one with .in(space), or declare policies.color.mixSpace')
      expect(error?.diagnostics[0]).toMatchObject({ fix: { message: fix } })
    }

    expectMissingSpace(() => open.addTokens({
      color: { missingSpace: open.legibleOn(open.colorMix(['red', 'blue']) as any) },
    }).consolidate())

    const referenced = createSystem()
    const module = referenced.defineTokens({
      color: {
        mix: referenced.tdef({ val: referenced.colorMix(['red', 'blue']) as any }),
      },
    }).add(m => ({
      color: { missingSpace: referenced.legibleOn(m.color.mix as any) },
    }))
    expectMissingSpace(() => referenced.addTokens(module).consolidate())
  })
})
