import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { calc, colorSchemes, createSystem, data, length, rawValue, schemeIs } from '../index'
import { collectInspection } from '../introspect/records'
import { substrate } from '../substrate'

function system() {
  return substrate.modules.runInFileScope({ filePath: 'fixture/system.ts' }, () => createSystem()
    .addTokens(h => ({
      color: {
        ink: h.tdef.color({ val: 'black', reference: 'var' }),
        edge: h.tdef.color({ val: 'red', reference: 'var' }),
        folded: h.tdef.color({ val: 'red', reference: 'val' }),
      },
      stroke: { hairline: h.tdef.length({ val: length.px(1), reference: 'var' }) },
      space: { md: h.tdef.length({ val: length.px(8), reference: 'var' }) },
      text: { body: { color: h.tdef.color({ val: 'red', reference: 'var' }) } },
      zero: h.tdef.number({ val: 0, reference: 'var' }),
      padding: h.tdef.color({ val: 'red', reference: 'var' }),
    }))
    .consolidate({ prefix: 'origin' }))
}

describe('declaration components', () => {
  it('records token and literal origins in their shorthand components', () => {
    const ds = system()
    const { records } = collectInspection(() => emit(() => {
      ds.class({ color: `${ds.t.color.ink}` }, 'color')
      ds.class({ border: `${ds.t.stroke.hairline} solid ${ds.t.color.edge}` }, 'border')
      ds.class({ border: `1px solid ${ds.t.color.edge}` }, 'literal-border')
    }))
    const styles = records.filter(record => record.kind === 'style') as any[]
    expect(styles[0].declarations[0].components).toMatchObject([
      { origin: 'token', component: 'color', tokens: ['color.ink'], dataType: 'color', evidence: { level: 'type' } },
    ])
    expect(styles[1].declarations[0].components).toMatchObject([
      { origin: 'token', component: 'border-width', tokens: ['stroke.hairline'], dataType: 'length' },
      { origin: 'literal', component: 'border-style', tokens: [] },
      { origin: 'token', component: 'border-color', tokens: ['color.edge'], dataType: 'color' },
    ])
    expect(styles[2].declarations[0].components[0]).toMatchObject({ origin: 'literal', component: 'border-width', tokens: [], dataType: 'length' })
  })

  it('keeps val-reference interpolation literal and a direct bundle leaf a token', () => {
    const ds = system()
    const { records } = collectInspection(() => emit(() => {
      ds.class({ color: `${ds.t.color.folded}` }, 'folded')
      ds.class({ ...ds.t.text.body.color.$dec }, 'bundle')
    }))
    const styles = records.filter(record => record.kind === 'style') as any[]
    expect(styles[0].declarations[0].components[0]).toMatchObject({ origin: 'literal', tokens: [] })
    expect(styles[1].declarations[0].components[0]).toMatchObject({ origin: 'token', tokens: ['text.body.color'] })
  })

  it('retains a token component when a declaration carries priority', () => {
    const ds = system()
    const { records, result } = collectInspection(() => emit(() => ds.class({ color: `${ds.t.color.ink} !/**/IMPORTANT` })))
    expect(result.css).toContain('!/**/IMPORTANT')
    const style = records.find(record => record.kind === 'style')!
    expect(style.declarations![0]!.components[0]!).toMatchObject({
      origin: 'token',
      dataType: 'color',
      tokens: ['color.ink'],
      evidence: { level: 'type' },
    })
  })

  it('records a token derivation, a typed port, and an unresolved external independently', () => {
    const ds = system()
    const { records } = collectInspection(() => emit(() => {
      ds.class({ padding: calc(ds.t.space.md).multiply(2) }, 'derived')
      ds.class({ paddingInline: ds.port(length.px(8)) }, 'port')
      ds.class({ padding: 'var(--external)' }, 'external')
    }))
    const styles = records.filter(record => record.kind === 'style') as any[]
    expect(styles[0].declarations[0].components[0]).toMatchObject({ origin: 'derived', tokens: ['space.md'], dataType: 'length' })
    expect(styles[1].declarations[0].components[0]).toMatchObject({ origin: 'port', dataType: 'length' })
    expect(styles[2].declarations[0].components[0]).toMatchObject({ origin: 'external', tokens: [], evidence: { level: 'unresolved' } })
  })

  it.each(['handle', 'number-zero', 'interpolation', 'bundle', 'typed-value'])('rejects a %s token-kind mismatch at build', (form) => {
    const ds = system()
    const rule = form === 'handle'
      ? { padding: ds.t.color.ink }
      : form === 'number-zero'
        ? { padding: ds.t.zero }
        : form === 'interpolation'
          ? { border: `1px solid ${ds.t.space.md}` }
          : form === 'bundle'
            ? { ...ds.t.padding.$dec }
            : { color: calc(ds.t.space.md).multiply(2) }
    expect(() => emit(() => ds.class(rule as never, form))).toThrow(/VANITY_CSS_TOKEN_KIND/)
    if (form === 'interpolation')
      expect(() => emit(() => ds.class(rule as never, form))).toThrow(/border-color/)
  })

  it('checks every relevant axis environment and narrows a surrounding condition', () => {
    const open = createSystem().addConditions({ cozy: data('density', 'cozy') }).addAxis('scheme', colorSchemes()).addAxis('density', { modes: { cozy: data('density', 'cozy'), compact: data('density', 'compact') }, default: 'cozy' })
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/environment-system.ts' }, () => open.addTokens({
      space: { step: open.tdef.length({ val: length.px(8), axes: { density: { compact: length.px(-1) } } }) },
    }).consolidate())
    expect(() => emit(() => ds.class({ padding: ds.t.space.step }))).toThrow(/density=compact,scheme=light/)
    const { records } = collectInspection(() => emit(() => ds.class({ cozy: { padding: ds.t.space.step } })))
    const style = records.find(record => record.kind === 'style')!
    expect(style.declarations![0]!.components[0]!.evidence).toEqual({
      level: 'environments',
      environments: ['density=cozy,scheme=light', 'density=cozy,scheme=dark'],
    })
  })

  it('checks compound cases through token dependencies and records each narrowed product state once', () => {
    const open = createSystem().addAxes({
      scheme: colorSchemes(),
      density: { modes: { cozy: data('density', 'cozy'), compact: data('density', 'compact') }, default: 'cozy' },
      skin: { modes: { soft: data('skin', 'soft'), crisp: data('skin', 'crisp') }, default: 'soft' },
    }).addConditions({ light: schemeIs('light') })
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/product-system.ts' }, () => open.addTokens(open.defineTokens()
      .add('gap', {
        val: length.px(8),
        axes: { density: { compact: length.px(4) }, skin: { crisp: length.px(6) } },
        cases: [{ when: { scheme: 'dark', density: 'compact', skin: 'crisp' }, val: length.px(-1) }],
      })
      .add(m => ({ alias: open.tdef.length({ val: m.gap, reference: 'var' }) })))
      .consolidate())
    expect(() => emit(() => ds.class({ padding: ds.t.alias }))).toThrow(/scheme=dark,density=compact,skin=crisp/)
    const { records } = collectInspection(() => emit(() => ds.class({ light: { padding: ds.t.alias } })))
    const style = records.find(record => record.kind === 'style')!
    for (const declaration of style.declarations!) {
      expect(declaration.components[0]!.evidence).toEqual({
        level: 'environments',
        environments: [
          'scheme=light,density=cozy,skin=soft',
          'scheme=light,density=cozy,skin=crisp',
          'scheme=light,density=compact,skin=soft',
          'scheme=light,density=compact,skin=crisp',
        ],
      })
    }
  })

  it('validates the subtree value instead of the root token default', () => {
    const ds = system()
    expect(() => emit(() => ds.class({ ...ds.tdec({ space: { md: length.px(-2) } }), padding: ds.t.space.md })))
      .toThrow(/VANITY_CSS_TOKEN_KIND/)
    expect(() => emit(() => ds.class({ ...ds.tdec({ space: { md: length.px(2) } }), padding: ds.t.space.md })))
      .not
      .toThrow()
  })

  it('keeps inherited dependents fixed until their declarations are repeated in the subtree', () => {
    const make = (seed: number) => substrate.modules.runInFileScope({ filePath: 'fixture/inherited-system.ts' }, () => {
      const open = createSystem()
      return open.addTokens(open.defineTokens()
        .add('root', { val: length.px(seed), mutable: true })
        .add(m => ({ dependent: open.tdef.length({ val: m.root, reference: 'var' }) })))
        .consolidate()
    })
    const positive = make(8)
    const negative = make(-8)
    expect(() => emit(() => positive.class({ ...positive.tdec({ root: length.px(-8) }), padding: positive.t.dependent }))).not.toThrow()
    expect(() => emit(() => negative.class({ ...negative.tdec({ root: length.px(8) }), padding: negative.t.dependent }))).toThrow(/VANITY_CSS_TOKEN_KIND/)
    expect(() => emit(() => positive.class({ ...positive.tdec.propagated({ root: length.px(-8) }), padding: positive.t.dependent }))).toThrow(/VANITY_CSS_TOKEN_KIND/)
    expect(() => emit(() => negative.class({ ...negative.tdec.propagated({ root: length.px(8) }), padding: negative.t.dependent }))).not.toThrow()
  })

  it('narrows negated selector and scheme conditions without reading a negative match as positive', () => {
    const cozy = data('density', 'cozy')
    const compact = data('density', 'compact')
    const open = createSystem().addConditions({ notCozy: cozy.not(), notCompact: compact.not(), either: cozy.or(compact), notDark: schemeIs('dark').not() }).addAxis('scheme', colorSchemes()).addAxis('density', { modes: { cozy, compact }, default: 'cozy' })
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/negative-environment-system.ts' }, () => open.addTokens({
      space: open.tdef.length({ val: length.px(8), axes: { density: { compact: length.px(-1) } } }),
      lightBad: open.tdef.length({ val: length.px(-1), axes: { scheme: { dark: length.px(8) } } }),
    }).consolidate())
    expect(() => emit(() => ds.class({ notCozy: { padding: ds.t.space } }))).toThrow(/density=compact/)
    expect(() => emit(() => ds.class({ either: { padding: ds.t.space } }))).toThrow(/density=compact/)
    expect(() => emit(() => ds.class({ notDark: { padding: ds.t.lightBad } }))).toThrow(/scheme=light/)
    const { records } = collectInspection(() => emit(() => ds.class({ notCompact: { padding: ds.t.space } })))
    const style = records.find(record => record.kind === 'style')!
    for (const declaration of style.declarations!) {
      expect(declaration.components[0]!.evidence).toEqual({
        level: 'environments',
        environments: ['density=cozy,scheme=light', 'density=cozy,scheme=dark'],
      })
    }
  })

  it('uses the same declaration contract in keyframes', () => {
    const ds = system()
    expect(() => emit(() => ds.keyframes({ from: { padding: ds.t.color.ink } } as never))).toThrow(/VANITY_CSS_TOKEN_KIND/)
    expect(() => emit(() => ds.keyframes({ from: { padding: -1 } }))).toThrow(/VANITY_CSS_INVALID_VALUE/)
    expect(() => emit(() => ds.keyframes({ from: { padding: ds.t.space.md }, to: { padding: 0 } }))).not.toThrow()
  })

  it('reports a reserved typed token as unresolved when the property needs its default', () => {
    const open = createSystem()
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/reservation-system.ts' }, () => open
      .addTokens({ pad: open.tdef.length({ mutable: true }) })
      .consolidate())
    const { records } = collectInspection(() => emit(() => ds.class({ padding: ds.t.pad })))
    const style = records.find(record => record.kind === 'style')!
    expect(style.declarations![0]!.components[0]!).toMatchObject({
      origin: 'token',
      tokens: ['pad'],
      dataType: 'length',
      evidence: { level: 'unresolved', reason: 'No authored default for a referenced value' },
    })
  })

  it('keeps a compound token in its grammar position without shifting later components', () => {
    const open = createSystem()
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/compound-system.ts' }, () => open.addTokens({
      position: open.tdef({ val: rawValue.position('left top'), reference: 'var' }),
      ink: open.tdef.color({ val: 'red', reference: 'var' }),
    }).consolidate())
    const { records } = collectInspection(() => emit(() => {
      ds.class({ backgroundPosition: ds.t.position })
      ds.class({ background: `${ds.t.position} / cover ${ds.t.ink}` })
    }))
    const styles = records.filter(record => record.kind === 'style')
    expect(styles[0]!.declarations![0]!.components[0]!).toMatchObject({ origin: 'token', dataType: 'position', tokens: ['position'] })
    const components = styles[1]!.declarations![0]!.components
    expect(components[0]).toMatchObject({ component: 'background-position', tokens: ['position'] })
    expect(components.at(-1)).toMatchObject({ component: 'background-color', dataType: 'color', tokens: ['ink'] })
  })

  it('proves token positions inside a function without rejecting valid relative-color syntax', () => {
    const open = createSystem()
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/gradient-system.ts' }, () => open.addTokens({
      ink: open.tdef.color({ val: 'oklch(from red 0.5 0.1 h)', reference: 'var' }),
      edge: open.tdef.color({ val: 'blue', reference: 'var' }),
      space: length.px(8),
    }).consolidate())
    const { records } = collectInspection(() => emit(() => ds.class({ background: `linear-gradient(140deg, ${ds.t.ink}, ${ds.t.edge})` })))
    const style = records.find(record => record.kind === 'style')!
    expect(style.declarations![0]!.components[0]!).toMatchObject({
      component: 'background-image',
      dataType: 'image',
      origin: 'derived',
      tokens: ['ink', 'edge'],
      evidence: { level: 'type' },
    })
    expect(() => emit(() => ds.class({ background: `linear-gradient(140deg, ${ds.t.ink}, ${ds.t.space})` }))).toThrow(/VANITY_CSS_TOKEN_KIND/)
  })

  it('checks string calculations over known tokens and preserves unknown inputs as unresolved', () => {
    const open = createSystem()
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/string-math-system.ts' }, () => open.addTokens({
      space: length.px(8),
      ink: open.tdef.color({ val: 'red', reference: 'var' }),
      unknown: open.tdef.unknown({ val: '8px', mutable: true }),
    }).consolidate())
    expect(() => emit(() => ds.class({ color: `calc(${ds.t.space} * 2)` }))).toThrow(/VANITY_CSS_TOKEN_KIND/)
    expect(() => emit(() => ds.class({ padding: `calc(${ds.t.space} + ${ds.t.ink})` }))).toThrow(/Incompatible math dimensions/)
    const { records } = collectInspection(() => emit(() => {
      ds.class({ padding: `calc(${ds.t.space} * 2)` }, 'known')
      ds.class({ padding: `calc(${ds.t.unknown} * 2)` }, 'unknown')
    }))
    const styles = records.filter(record => record.kind === 'style')
    expect(styles[0]!.declarations![0]!.components[0]!).toMatchObject({
      origin: 'derived',
      tokens: ['space'],
      evidence: { level: 'environments' },
    })
    expect(styles[1]!.declarations![0]!.components[0]!).toMatchObject({
      origin: 'derived',
      tokens: ['unknown'],
      evidence: { level: 'unresolved', reason: 'Token has no declared data type' },
    })
  })
})
