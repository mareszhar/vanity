/**
 * The manifest ([spec-introspection.md §2]): one machine-readable
 * projection of everything the build knows — tokens with per-scheme values
 * and usage, recipes with their variant spaces, ports, escapes, contrast
 * results. Locked over the Prism fixtures through the same collection channel
 * the `/vite` plugin drives.
 */

import { definePrismSystem, emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createSystem, unsafe } from '../index'
import { substrate } from '../substrate'
import { buildAgentContext, generateAgentContext } from './agent'
import { buildManifest, countVariableReferences, createManifestModules, getManifestTokenUsage } from './manifest'
import { collectInspection } from './records'

function locked(open: { readonly consolidate: (options?: object) => object }, options: object = {}) {
  return substrate.modules.runInFileScope({
    filePath: 'src/introspect/introspect.system.ts',
    packageName: '@vanity/introspect-fixture',
  }, () => open.consolidate(options)) as any
}

/** Prism plus a representative styled surface, collected as the plugin would. */
function prismManifest() {
  const { records, result } = collectInspection(() => emit(() => {
    const { t, class: style, raw, rules, recipe, port, atoms: makeAtoms } = definePrismSystem()

    const fraction = port(0, { label: 'fraction' })

    const button = recipe({
      base: { display: 'inline-flex', gap: t.space.xs, borderRadius: t.radius.sm },
      variants: {
        intent: {
          brand: { background: t.color.brand, color: t.color.onBrand },
          ghost: { background: 'transparent', hover: { background: t.color.brandSoft } },
        },
        size: { sm: { paddingInline: t.space.sm }, md: { paddingInline: t.space.md } },
      },
      toggles: { pill: { borderRadius: t.radius.pill } },
      defaults: { intent: 'brand', size: 'md' },
      ports: { fraction },
    }, 'button')

    const fill = style({ inlineSize: `calc(${fraction} * 100%)`, background: t.color.brand }, 'fill')
    const promo = style.layer('overrides')({ padding: t.space.lg }, 'promo')
    const prose = raw`h2 { margin-block: 0.5rem; }`

    rules({ 'body': { color: t.color.ink }, '.third-party-widget': { borderRadius: t.radius.md } })

    const atoms = makeAtoms({ properties: { gap: { sm: t.space.sm } } }, 'atoms')
    const escaped = atoms({ gap: unsafe.value('37px', 'editorial measure') })

    return { button, fill, promo, prose, escaped }
  }))

  return { manifest: buildManifest(records, result.css), css: result.css, records }
}

describe('the manifest', () => {
  const { manifest, css } = prismManifest()
  const modules = createManifestModules(manifest)
  const recipes = Object.assign({}, ...modules.map(module => module.recipes))
  const ports = Object.assign({}, ...modules.map(module => module.ports))
  const escapes = modules.flatMap(module => module.escapes)
  const contrast = modules.flatMap(module => module.contrast)
  const usage = getManifestTokenUsage(manifest)

  it('is versioned and carries the system: layers in order, conditions serialized', () => {
    expect(manifest.version).toBe(4)
    expect(manifest.system.layers.map(layer => layer.name)).toEqual(['reset', 'tokens', 'recipes', 'utilities', 'overrides'])
    expect(manifest.system.conditions.open.readable).toBe('&[data-state="open"]')
    expect(manifest.system.conditions.md.readable).toBe('@media (min-width: 768px)')
    expect(manifest.system.conditions.hover.readable).toBe('&:hover')
    // A two-arm condition serializes both circumstances.
    expect(manifest.system.conditions.dark.readable).toContain('[data-scheme=\'dark\']')
    expect(manifest.system.conditions.dark.readable).toContain('@media (prefers-color-scheme: dark)')
    expect(manifest.system.conditions.open.arms).toEqual([{ selector: '&[data-state="open"]' }])
    expect(manifest.system.conditions.dark.arms).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: expect.stringContaining('[data-scheme=\'dark\']') }),
      expect.objectContaining({ media: '(prefers-color-scheme: dark)' }),
    ]))
  })

  it('projects every token: public name, traits, previews, dependencies, and declarations', () => {
    const brand = manifest.system.tokens['color.brand']

    expect(brand.name).toBe('--vanity-color-brand')
    expect(brand.reference).toBe('var')
    expect(brand.mutable).toBe(true)
    expect(brand.preview).toMatchObject({ status: 'resolved', val: 'oklch(0.58 0.2 285)' })
    expect(brand.declarations.length).toBeGreaterThan(0)
    expect(brand.description).toBe('Primary brand hue. Marketing owns this.')

    // Preset elevation names its live base explicitly, so the surface remains
    // scheme-varied and re-tints when that base changes.
    const surface = manifest.system.tokens['color.surface']
    expect(surface.expression.kind).toBe('color')
    expect(surface.mutable).toBe(false)
    expect(surface.fold.status).toBe('preserved')

    // A derivation keeps its graph edges visible.
    expect(manifest.system.tokens['color.brandSoft'].dependencies.map(edge => edge.path)).toEqual(['color.brand'])
    expect(manifest.system.tokens['color.onBrand'].dependencies.map(edge => edge.path)).toEqual(['color.brand'])
  })

  it('counts usage from the emitted CSS, graph-internal edges excluded', () => {
    // brand: used by fill + button_intent_brand — its brandSoft/onBrand edges don't count.
    expect(usage['color.brand']).toBe(2)
    // canvas: defined, never referenced anywhere.
    expect(usage['color.canvas']).toBe(0)
    // ink: used once, by the body rule.
    expect(usage['color.ink']).toBe(1)
  })

  it('projects recipes: variant space, toggles, defaults, published ports', () => {
    expect(recipes.button).toMatchObject({
      variants: { intent: ['brand', 'ghost'], size: ['sm', 'md'] },
      toggles: ['pill'],
      defaults: { intent: 'brand', size: 'md' },
    })
    expect(recipes.button.ports.fraction).toMatch(/^--vanity-fraction/)
  })

  it('projects ports under Component.export names, typed by their defaults', () => {
    expect(ports['prism.fraction']).toMatchObject({ type: 'number', default: 0 })
    expect(ports['prism.fraction'].var).toMatch(/^--vanity-fraction/)
  })

  it('inventories every escape: raw, unsafe, foreign rules, overrides layer', () => {
    const forms = escapes.map(escape => escape.form)

    expect(forms).toContain('raw')
    expect(forms).toContain('unsafe')
    expect(forms).toContain('overrides')
    expect(forms.filter(form => form === 'rules')).toHaveLength(2)

    const unsafeEscape = escapes.find(escape => escape.form === 'unsafe')!
    expect(unsafeEscape.detail).toBe('gap: 37px')
    expect(unsafeEscape.reason).toBe('editorial measure')
  })

  it('carries the contrast results — the legibleOn pairing measured per scheme', () => {
    const onBrand = contrast.filter(entry => entry.pairing === 'color.onBrand')

    expect(onBrand.map(entry => entry.scheme).sort()).toEqual(['dark', 'light'])
    expect(onBrand.every(entry => entry.algorithm === 'apca' && entry.measured >= entry.min)).toBe(true)
    expect(onBrand.every(entry => !entry.accepted)).toBe(true)
  })

  it('the emitted CSS itself still carries every reference the counts claim', () => {
    expect(countVariableReferences(css, '--vanity-color-brand')).toBeGreaterThanOrEqual(2)
    expect(countVariableReferences('var(--vanity-a) var(--vanity-a, 1px) var(--vanity-a-b)', '--vanity-a')).toBe(2)
  })
})

describe('the audit config', () => {
  it('rides the system record into the manifest', () => {
    const open = createSystem().addTokens({ space: { sm: '8px' } })
    const ds = locked(open, { audit: { unusedTokens: 'error' } })
    const { records, result } = collectInspection(() => emit(() => ds.class({ padding: ds.t.space.sm })))

    expect(buildManifest(records, result.css).system.audits.unusedTokens.level).toBe('error')
  })
})

describe('structured explanation and agent context', () => {
  it('explains one token from source expression through declarations and runtime slots', () => {
    const open = createSystem().addAxis('scheme', { modes: { light: '&', dark: '&[data-scheme=dark]' }, default: 'light' })
    const ds = locked(open.addTokens(open.defineTokens({
      color: {
        brand: open.tdef({
          val: open.oklch(0.58, 0.2, 285),
          mutable: true,
          axes: { scheme: { dark: open.oklch(0.72, 0.14, 285) } },
        }),
      },
    })), { prefix: 'app' })
    const explanation = ds.explain(ds.t.color.brand)

    expect(explanation).toMatchObject({
      path: ['color', 'brand'],
      name: '--app-color-brand',
      type: 'color',
      reference: 'var',
      mutable: true,
      expression: { kind: 'color' },
      runtime: { addresses: expect.arrayContaining([expect.objectContaining({ address: { kind: 'base' } })]) },
      portability: { status: 'portable' },
    })
    expect(explanation.declarations.some((declaration: any) => declaration.kind === 'axis')).toBe(true)
    expect(explanation.branches).toContainEqual(expect.objectContaining({
      address: { kind: 'axis', axis: 'scheme', mode: 'dark' },
    }))
  })

  it('derives compact machine and prose context from the manifest', () => {
    const { manifest } = prismManifest()
    const context = buildAgentContext(manifest)
    const prose = generateAgentContext(manifest)

    const brand = context.tokens.find(token => token.path === 'color.brand')
    expect(brand).toBeDefined()
    expect(brand!.contexts).toContainEqual(expect.stringContaining('root '))
    expect(context.policy.rawAssertions).toBeGreaterThan(0)
    expect(prose).toContain('Token vocabulary:')
    expect(prose).toContain('color.brand')
  })
})
