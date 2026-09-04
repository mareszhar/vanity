/**
 * Audits ([spec-introspection.md §3]): drift the build can see and lint
 * can't — unused tokens, near-duplicate raw values, contrast acceptances, the
 * escape inventory, scale strays. Advisory by default, promotable per system.
 */

import type { VanityAuditFinding, VanityUnevaluatedAudit } from './audit'
import {
  axis,
  createSystem,
  defineCssValue,
  definePlugin,
  propertyAliases,
  unsafe,
} from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { substrate } from '../substrate'
import { createAxisCondition } from '../system/axes'
import { audit, formatAuditFindings, runSystemAudit } from './audit'
import { buildManifest } from './manifest'
import { collectInspection } from './records'

function locked(open: { readonly consolidate: (options?: object) => object }, options: object = {}) {
  return substrate.modules.runInFileScope({
    filePath: 'src/introspect/audit.system.ts',
    packageName: '@vanity/introspect-fixture',
  }, () => open.consolidate(options)) as any
}

function system(tokens: object, options: object = {}) {
  const open = createSystem()
  return locked(open.addTokens(tokens as any), options)
}

/** Build a manifest + CSS from a style-module body, exactly as the plugin would. */
function built(body: () => unknown) {
  const { records, result } = collectInspection(() => emit(body))
  return { manifest: buildManifest(records, result.css), css: result.css }
}

describe('unused tokens', () => {
  it('flags a token nothing references, with the delete-or-deprecate fix', () => {
    const ds = system({ space: { sm: '8px', md: '16px' } })
    const { manifest, css } = built(() => ds.class({ padding: ds.t.space.sm }, 'card'))

    const findings = audit(manifest, css)
    const unused = findings.filter(finding => finding.kind === 'unusedTokens')

    expect(unused).toHaveLength(1)
    expect(unused[0].message).toContain('space.md')
    expect(unused[0].fix).toContain('.deprecated(')
  })

  it('a token feeding a used derivation is used; a deprecated token is already handled', () => {
    const open = createSystem()
    const tokens = open.defineTokens({
      color: {
        seed: open.tdef({ val: open.oklch(0.58, 0.2, 285), mutable: true }),
        retired: open.tdef({ val: open.oklch(0.5, 0.1, 100), deprecated: { reason: 'use color.seed' } }),
      },
    }).add(m => ({ color: { tint: open.alpha(m.color.seed, 0.12) } }))
    const ds = locked(open.addTokens(tokens))
    const { manifest, css } = built(() => ds.class({ background: ds.t.color.tint }, 'card'))

    const paths = audit(manifest, css)
      .filter(finding => finding.kind === 'unusedTokens')
      .map(finding => finding.message)

    // seed feeds tint (used); retired is deprecated — neither is a finding.
    expect(paths).toEqual([])
  })
})

describe('near-duplicate values', () => {
  it('flags a raw color that reads as an existing token, naming the token', () => {
    const ds = system({ color: { brand: '#635bff' } })
    const { manifest, css } = built(() => ds.class({ background: '#645cff' }, 'card')) // one step off the token

    const findings = audit(manifest, css).filter(finding => finding.kind === 'nearDuplicates')

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('#645cff')
    expect(findings[0].fix).toBe('use t.color.brand')
  })

  it('stays silent on genuinely different colors and var-borne values', () => {
    const ds = system({ color: { brand: '#635bff' } })
    const { manifest, css } = built(() => ds.class({ background: ds.t.color.brand, color: '#11aa22' }, 'card'))

    expect(audit(manifest, css).filter(finding => finding.kind === 'nearDuplicates')).toEqual([])
  })
})

describe('contrast acceptances', () => {
  it('surfaces a consciously-accepted threshold so it stays a decision', () => {
    const open = createSystem()
    const tokens = open.defineTokens({ color: { mid: open.oklch(0.6, 0.02, 285) } })
      .add(m => ({ color: { onMid: open.legibleOn(m.color.mid, { contrast: 40 }) } }))
    const ds = locked(open.addTokens(tokens))
    const { manifest, css } = built(() => ds.class({ color: ds.t.color.onMid, background: ds.t.color.mid }, 'chip'))

    const findings = audit(manifest, css).filter(finding => finding.kind === 'contrast')

    expect(findings).toHaveLength(2) // one per scheme
    expect(findings[0].message).toContain('color.onMid')
    expect(findings[0].message).toContain('APCA Lc 40')
  })
})

describe('the escape inventory', () => {
  it('enumerates raw CSS, unsafe values with reasons, foreign rules, and overrides', () => {
    const ds = system({ space: { sm: '8px' } })
    const { manifest, css } = built(() => {
      const { t, class: style, rules, raw, atoms: makeAtoms } = ds

      style.layer('overrides')({ padding: t.space.sm }, 'fix')
      void raw`h2 { margin-block: 1rem; }`
      rules({ 'body': { margin: 0 }, '.cookie-banner': { display: 'none' } })

      const atoms = makeAtoms({ properties: { gap: { sm: t.space.sm } } }, 'atoms')
      return atoms({ gap: unsafe.value('37px', 'editorial measure') })
    })

    const messages = audit(manifest, css)
      .filter(finding => finding.kind === 'escapes')
      .map(finding => finding.message)

    expect(messages).toHaveLength(4)
    expect(messages.some(message => message.includes('raw'))).toBe(true)
    expect(messages.some(message => message.includes('\'editorial measure\''))).toBe(true)
    expect(messages.some(message => message.includes('.cookie-banner'))).toBe(true)
    expect(messages.some(message => message.includes('overrides-layer'))).toBe(true)
    // body is ordinary global styling, not an escape.
    expect(messages.some(message => message.includes('\'body\''))).toBe(false)
  })

  it('separates typed raw assertions and aliases-only standard escapes into actionable categories', () => {
    const ds = locked(createSystem()
      .addPlugin(propertyAliases({ py: 'paddingBlock' }, { expose: 'aliases-only' })))
    const { manifest, css } = built(() => {
      ds.raw`h2 { padding-block: 1rem; }`
      return ds.class.standard({ paddingBlock: '2rem' }, 'platform-spelling')
    })
    const findings = audit(manifest, css)

    expect(findings).toContainEqual(expect.objectContaining({ kind: 'rawAssertions', message: expect.stringContaining('raw') }))
    expect(findings).toContainEqual(expect.objectContaining({ kind: 'aliasEscapes', message: expect.stringContaining('class.standard') }))
  })
})

describe('scale strays', () => {
  it('flags a literal on a property the tokens already own — z-index anarchy', () => {
    const ds = system({ z: { nav: 10, dialog: 20 } })
    const { manifest, css } = built(() => {
      const { t, class: style } = ds

      style({ zIndex: t.z.nav }, 'nav')
      style({ zIndex: t.z.dialog }, 'dialog')
      return style({ zIndex: 9999 }, 'toast')
    })

    const findings = audit(manifest, css).filter(finding => finding.kind === 'scaleStrays')

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('z-index: 9999')
    expect(findings[0].message).toContain('2 other z-index declarations ride the tokens')
  })

  it('never lectures a property the system did not tokenize', () => {
    const ds = system({ space: { sm: '8px' } })
    const { manifest, css } = built(() => ds.class({ zIndex: 9999, lineHeight: 1.5 }, 'toast'))

    expect(audit(manifest, css).filter(finding => finding.kind === 'scaleStrays')).toEqual([])
  })
})

describe('semantic provenance categories', () => {
  it('audits owning/condition specificity, ambiguous arms, mutable roots, and nonportable values', () => {
    const specificDs = system({ space: { sm: '8px' } }, { root: '#application#widget' })
    const specific = built(() => specificDs.class({ padding: specificDs.t.space.sm }))
    expect(audit(specific.manifest, specific.css)).toContainEqual(expect.objectContaining({
      kind: 'specificityContexts',
      message: expect.stringContaining('#application#widget'),
    }))

    const ambiguousOpen = createSystem().addAxis('state', axis({
      modes: {
        on: createAxisCondition({ arms: [{ selector: '&[data-a]' }, { selector: '&[data-b]' }] }),
      },
    }))
    const ambiguousDs = locked(ambiguousOpen.addTokens({
      color: { brand: ambiguousOpen.tdef({ val: 'red', axes: { state: { on: 'blue' } } }) },
    }))
    const ambiguous = built(() => ambiguousDs.class({ color: ambiguousDs.t.color.brand }))
    expect(audit(ambiguous.manifest, ambiguous.css)).toContainEqual(expect.objectContaining({
      kind: 'ambiguousAxes',
      message: expect.stringContaining('state.on'),
    }))

    const mutableOpen = createSystem()
    const mutableDs = locked(mutableOpen.addTokens({
      color: { brand: mutableOpen.tdef({ val: 'red', mutable: true }) },
    }), { root: '#application' })
    const mutable = built(() => mutableDs.class({ color: mutableDs.t.color.brand }))
    const mutableToken = mutable.manifest.system.tokens['color.brand']!
    const hazardousManifest = {
      ...mutable.manifest,
      system: {
        ...mutable.manifest.system,
        tokens: {
          ...mutable.manifest.system.tokens,
          'color.brand': {
            ...mutableToken,
            declarations: mutableToken.declarations.map((declaration, index) => index === 0
              ? { ...declaration, context: { ...declaration.context, selectors: ['#portal[data-open]'] } }
              : declaration),
          },
        },
      },
    }
    expect(audit(hazardousManifest, mutable.css)).toContainEqual(expect.objectContaining({
      kind: 'mutableRootHazards',
      message: expect.stringContaining('#portal[data-open]'),
    }))

    const mystery = defineCssValue({
      type: 'length',
      extension: { id: 'org.example.audit-opaque', version: 1 },
      create: (value: number) => ({ serialize: () => `${value}px` }),
    })
    const opaquePlugin = definePlugin({
      id: 'org.example.audit-opaque',
      version: 1,
      setup: ds => ds.addConstructor('mystery', { call: mystery }),
    })
    const opaqueOpen = createSystem().addPlugin(opaquePlugin)
    const opaqueDs = locked(opaqueOpen.addTokens({
      space: { mystery: opaqueOpen.tdef({ val: opaqueOpen.mystery(7) }) },
    }))
    const opaque = built(() => opaqueDs.class({ padding: opaqueDs.t.space.mystery }))
    expect(audit(opaque.manifest, opaque.css)).toContainEqual(expect.objectContaining({
      kind: 'nonportableValues',
      message: expect.stringContaining('space.mystery'),
    }))
  })
})

describe('focus visibility', () => {
  it('flags an erased outline and points to focusRing()', () => {
    const ds = system({})
    const { manifest, css } = built(() => ds.class({ outline: 'none' }, 'button'))

    const findings = audit(manifest, css).filter(finding => finding.kind === 'focusVisibility')

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('without a :focus-visible replacement')
    expect(findings[0].fix).toContain('focusRing()')
  })

  it('stays silent when the same class supplies a visible focus ring', () => {
    const ds = system({})
    const { manifest, css } = built(() => ds.class({
      outline: 'none',
      focusVisible: { outline: '2px solid currentColor', outlineOffset: '2px' },
    }, 'button'))

    expect(audit(manifest, css).filter(finding => finding.kind === 'focusVisibility')).toEqual([])
  })
})

describe('system-scope audit', () => {
  it('runs specificity, ambiguity, mutable-root, nonportable, and overwrite categories', () => {
    const specificDs = system({ space: { sm: '8px' } }, { root: '#application#widget' })
    expect(specificDs.audit().findings).toContainEqual(expect.objectContaining({ kind: 'specificityContexts' }))

    const ambiguousOpen = createSystem().addAxis('state', axis({
      modes: {
        on: createAxisCondition({ arms: [{ selector: '&[data-a]' }, { selector: '&[data-b]' }] }),
      },
    }))
    const ambiguousDs = locked(ambiguousOpen.addTokens({
      color: { brand: ambiguousOpen.tdef({ val: 'red', axes: { state: { on: 'blue' } } }) },
    }))
    expect(ambiguousDs.audit().findings).toContainEqual(expect.objectContaining({ kind: 'ambiguousAxes' }))

    const mutableOpen = createSystem()
    const mutableDs = locked(mutableOpen.addTokens(
      mutableOpen.defineTokens({
        color: { brand: mutableOpen.tdef({ val: 'red', mutable: true }) },
      }).root('#portal'),
    ))
    expect(mutableDs.audit().findings).toContainEqual(expect.objectContaining({ kind: 'mutableRootHazards' }))

    const mystery = defineCssValue({
      type: 'length',
      extension: { id: 'org.example.audit-system-opaque', version: 1 },
      create: (value: number) => ({ serialize: () => `${value}px` }),
    })
    const opaquePlugin = definePlugin({
      id: 'org.example.audit-system-opaque',
      version: 1,
      setup: ds => ds.addConstructor('mystery', { call: mystery }),
    })
    const opaqueOpen = createSystem().addPlugin(opaquePlugin)
    const opaqueDs = locked(opaqueOpen.addTokens({
      space: { mystery: opaqueOpen.tdef({ val: opaqueOpen.mystery(7) }) },
    }))
    expect(opaqueDs.audit().findings).toContainEqual(expect.objectContaining({ kind: 'nonportableValues' }))

    const overwritten = createSystem()
      .addTokens({ color: { brand: 'red' } })
      .overwriteTokens({ color: { brand: 'blue' } })
    const overwrittenDs = locked(overwritten)
    expect(overwrittenDs.audit().findings).toContainEqual(expect.objectContaining({ kind: 'overwriteInventory' }))
  })

  it('reports every category that needs build evidence instead of pretending it ran', () => {
    const report = system({ color: { brand: 'red' } }).audit()

    expect(report.unevaluated).toEqual([
      { kind: 'unusedTokens', requires: 'moduleUsage' },
      { kind: 'contrast', requires: 'moduleUsage' },
      { kind: 'escapes', requires: 'moduleUsage' },
      { kind: 'aliasEscapes', requires: 'moduleUsage' },
      { kind: 'rawAssertions', requires: 'moduleUsage' },
      { kind: 'nearDuplicates', requires: 'emittedCss' },
      { kind: 'scaleStrays', requires: 'emittedCss' },
      { kind: 'focusVisibility', requires: 'emittedCss' },
      { kind: 'eagerStyleBarrels', requires: 'buildEvidence' },
      { kind: 'cssParityGaps', requires: 'buildEvidence' },
      { kind: 'staleArtifacts', requires: 'buildEvidence' },
      { kind: 'rootModeDisagreements', requires: 'buildEvidence' },
    ])

    const silenced = system({ color: { brand: 'red' } }, { audit: { unusedTokens: 'off' } }).audit()
    expect(silenced.unevaluated.some((entry: VanityUnevaluatedAudit) => entry.kind === 'unusedTokens')).toBe(false)
  })

  it('applies consolidated promotion and per-call overrides to findings', () => {
    const open = createSystem()
      .addTokens({ color: { brand: 'red' } })
      .overwriteTokens({ color: { brand: 'blue' } })
    const ds = locked(open, { audit: { overwriteInventory: 'error' } })

    expect(ds.audit().findings.find((finding: VanityAuditFinding) => finding.kind === 'overwriteInventory')?.level).toBe('error')
    const warned = ds.audit({ overwriteInventory: 'warn' }).findings.find((finding: VanityAuditFinding) => finding.kind === 'overwriteInventory')
    const silenced = ds.audit({ overwriteInventory: 'off' }).findings.some((finding: VanityAuditFinding) => finding.kind === 'overwriteInventory')
    const defaulted = ds.audit({ overwriteInventory: undefined } as any).findings
    expect(warned?.level).toBe('warn')
    expect(silenced).toBe(false)
    expect(defaulted.every((finding: VanityAuditFinding) => finding.level === 'warn' || finding.level === 'error')).toBe(true)
  })

  it('shares the five system category implementations with the CLI audit', () => {
    const open = createSystem()
      .addTokens({ color: { brand: 'red' } })
      .overwriteTokens({ color: { brand: 'blue' } })
    const ds = locked(open)
    const { manifest, css } = built(() => ds.class({ color: ds.t.color.brand }, 'card'))
    const kinds = new Set(['ambiguousAxes', 'mutableRootHazards', 'overwriteInventory', 'nonportableValues', 'specificityContexts'])
    const fromSystem = ds.audit().findings.filter((finding: VanityAuditFinding) => kinds.has(finding.kind))
    const fromCli = audit(manifest, css).filter(finding => kinds.has(finding.kind))

    expect(fromSystem).toEqual(fromCli)
    expect(runSystemAudit(manifest.system).findings.filter(finding => kinds.has(finding.kind))).toEqual(fromSystem)
  })
})

describe('promotion and the report', () => {
  it('the system config promotes an audit category to error and can silence one', () => {
    const ds = system({ space: { sm: '8px', md: '16px' } }, {
      audit: { unusedTokens: 'error', escapes: 'off' },
    })
    const { manifest, css } = built(() => ds.class.layer('overrides')({ padding: '4px' }, 'fix'))

    const findings = audit(manifest, css)

    expect(findings.filter(finding => finding.kind === 'escapes')).toEqual([])
    expect(findings.filter(finding => finding.kind === 'unusedTokens')
      .every(finding => finding.level === 'error')).toBe(true)
  })

  it('formats grouped, deep-linked findings — and a clean pass says so', () => {
    const report = formatAuditFindings([
      { kind: 'unusedTokens', level: 'warn', message: 'space.md is defined but nothing references it', fix: 'delete it', file: 'design/tokens.css.ts' },
      { kind: 'escapes', level: 'error', message: 'css.raw block — h2 { … }' },
    ])

    expect(report).toContain('unused tokens (1)')
    expect(report).toContain('at design/tokens.css.ts')
    expect(report).toContain('fix: delete it')
    expect(report).toContain('escape inventory (1)')
    expect(report).toContain('1 promoted to error')

    expect(formatAuditFindings([])).toBe('✓ audit clean — no findings')
  })
})
