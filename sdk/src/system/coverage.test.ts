import { colorSchemes, createSystem, data, length } from '@mszr/vanity'
import { describe, expect, it } from 'vitest'
import { emitSystemCss } from '../compiler/projection/systemCss'
import { buildAgentContext } from '../introspect/agent'
import { buildManifest } from '../introspect/manifest'
import { assertManifestShape } from '../introspect/manifestValidation'
import { collectInspection } from '../introspect/records'
import { getSystemContract } from './contract'

function createCoveredSystem(extra: object = {}) {
  return createSystem().addAxis('skin', {
    modes: { calm: '&', crisp: data('skin', 'crisp'), playful: data('skin', 'playful') },
    default: 'calm',
    covers: ['radius'],
    ...extra,
  })
}

function addCoveredTokens(open: ReturnType<typeof createCoveredSystem>) {
  return open.addTokens({ radius: { card: open.tdef({ val: length.px(4), axes: { skin: { crisp: length.px(8), playful: length.px(12) } } }) } })
}

describe('declared axis coverage', () => {
  it('accounts for preserved native scheme selection directly and through dependencies, only on its selected modes', () => {
    const make = (name: 'scheme' | 'appearance' | 'skin', native: boolean, extraMode = false, shared: string[] = []) => {
      const values = createSystem()
      const tokens = values.defineTokens({ color: { direct: values.lightDark('white', 'black'), nested: values.alpha(values.lightDark('white', 'black'), 0.5), constantPick: values.legibleOn(values.lightDark('white', '#eee')) } })
        .add(t => ({ color: { alias: t.color.direct, dependent: values.alpha(t.color.direct, 0.5), valueReference: values.tdef.color({ val: t.color.direct, reference: 'val' }) } }))
      if (native) {
        const open = createSystem().addAxis(name, colorSchemes()).overwriteAxis(name, { covers: ['color'], shared })
        if (extraMode)
          return open.augmentAxis(name, { modes: { sepia: data(name, 'sepia') } }).addTokens(tokens).consolidate()
        return open.addTokens(tokens).consolidate()
      }
      return createSystem().addAxis(name, { modes: { light: '&', dark: data(name, 'dark') }, default: 'light', covers: ['color'], shared }).addTokens(tokens).consolidate()
    }
    expect(() => make('scheme', true, false, ['color.constantPick'])).not.toThrow()
    expect(() => make('appearance', true, false, ['color.constantPick'])).not.toThrow()
    expect(() => make('skin', false, false, ['color.constantPick'])).toThrow(/VANITY_AXIS_UNCOVERED.*skin.dark.*color.direct/s)
    expect(() => make('scheme', true, true, ['color.constantPick'])).toThrow(/VANITY_AXIS_UNCOVERED.*scheme.sepia.*color.direct/s)
    expect(() => make('scheme', true)).toThrow(/VANITY_AXIS_UNCOVERED.*scheme.dark.*color.constantPick/s)
  })
  it('names every missing leaf and mode with both repairs while the base covers the default', () => {
    try {
      createCoveredSystem().addTokens({ radius: { card: length.px(4), round: length.px(999) } }).consolidate()
      expect.fail('unaccounted roles must fail consolidation')
    }
    catch (error) {
      const diagnostics = (error as { diagnostics: Array<{ code: string, message: string, fix: { message: string } }> }).diagnostics
      expect(diagnostics).toHaveLength(4)
      for (const mode of ['crisp', 'playful']) {
        for (const leaf of ['radius.card', 'radius.round']) {
          expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'VANITY_AXIS_UNCOVERED', message: expect.stringContaining(`skin.${mode}`) }))
          expect(diagnostics.some(row => row.message.includes(leaf) && row.message.includes(mode) && row.fix.message.includes('arm') && row.fix.message.includes('shared'))).toBe(true)
        }
      }
      expect(diagnostics.every(row => !row.message.includes('skin.calm'))).toBe(true)
    }
  })

  it('accepts own arms, shared leaves and shared groups without asking derived roles for redundant arms', () => {
    expect(() => addCoveredTokens(createCoveredSystem()).consolidate()).not.toThrow()
    expect(() => createCoveredSystem({ shared: ['radius'] }).addTokens({ radius: { card: length.px(4), round: length.px(999) } }).consolidate()).not.toThrow()
    const open = createCoveredSystem({ shared: ['radius.round'] })
    const tokens = open.defineTokens({ step: open.tdef({ val: length.px(4), axes: { skin: { crisp: length.px(8), playful: length.px(12) } } }) })
      .add(t => ({ radius: { card: open.calc(t.step).multiply(2), alias: t.step, round: length.px(999) } }))
      .add(t => ({ radius: { chained: open.calc(t.radius.card).multiply(2) } }))
    expect(() => open.addTokens(tokens).consolidate()).not.toThrow()
  })

  it('expands groups after later contributions and rejects an unmatched covers entry', () => {
    expect(() => addCoveredTokens(createCoveredSystem()).addTokens({ radius: { late: length.px(1) } }).consolidate()).toThrow(/VANITY_AXIS_UNCOVERED.*radius.late/s)
    expect(() => createCoveredSystem({ covers: ['absent'] }).addTokens({ radius: length.px(4) }).consolidate()).toThrow(/VANITY_AXIS_UNCOVERED.*absent.*no token/s)
  })

  it('checks intersecting axes independently without demanding redundant case arms', () => {
    const open = createCoveredSystem().addAxis('density', { modes: { cozy: '&', compact: data('density', 'compact') }, default: 'cozy', covers: ['radius'] })
    const complete = open.addTokens({ radius: { card: open.tdef({ val: length.px(4), axes: { skin: { crisp: length.px(8), playful: length.px(12) }, density: { compact: length.px(2) } } }) } })
    expect(() => complete.consolidate()).not.toThrow()
    expect(() => open.addTokens({ radius: { card: open.tdef({ val: length.px(4), axes: { skin: { crisp: length.px(8), playful: length.px(12) } } }) } }).consolidate()).toThrow(/VANITY_AXIS_UNCOVERED.*density.compact.*radius.card/s)
  })

  it('preserves systems without coverage declarations and retains metadata through axis refinements', () => {
    expect(() => createCoveredSystem({ covers: undefined }).addTokens({ radius: length.px(4) }).consolidate()).not.toThrow()
    const ds = createCoveredSystem({ shared: ['radius'] }).augmentAxis('skin', { modes: { loud: data('skin', 'loud') } }).addTokens({ radius: length.px(4) }).consolidate()
    expect(ds.introspect().axes.skin).toMatchObject({ covers: ['radius'], shared: ['radius'] })
    const replaced = createCoveredSystem().overwriteAxis('skin', { shared: ['radius'] }).addTokens({ radius: length.px(4) }).consolidate()
    expect(replaced.introspect().axes.skin).toMatchObject({ covers: ['radius'], shared: ['radius'] })
  })

  it('publishes the declared contract in explain and agent context, and changes no CSS or runtime identity', () => {
    const make = (extra: object) => {
      const { records, result: ds } = collectInspection(() => addCoveredTokens(createCoveredSystem(extra)).consolidate({ prefix: 'covered' }))
      const contract = getSystemContract(ds)!
      const css = emitSystemCss(contract, { filePath: '/app/system.ts' }, 'debug').css
      const manifest = buildManifest(records, css)
      assertManifestShape(JSON.parse(JSON.stringify(manifest)))
      return { ds, contract, css, manifest }
    }
    const before = make({ covers: undefined })
    const after = make({ shared: ['radius.card'] })
    expect(after.ds.introspect().axes.skin).toMatchObject({ covers: ['radius'], shared: ['radius.card'] })
    expect(after.ds.explain(after.ds.axes.skin)).toMatchObject({ covers: ['radius'], shared: ['radius.card'] })
    expect(buildAgentContext(after.manifest).environment.axes).toContainEqual(expect.objectContaining({ name: 'skin', covers: ['radius'], shared: ['radius.card'] }))
    expect(after.css).toBe(before.css)
    expect(after.contract.portable.identities.compatibility).not.toBe(before.contract.portable.identities.compatibility)
    expect(after.contract.portable.identities.css).toBe(before.contract.portable.identities.css)
    expect(after.contract.portable.identities.runtime).toBe(before.contract.portable.identities.runtime)
  })
})
