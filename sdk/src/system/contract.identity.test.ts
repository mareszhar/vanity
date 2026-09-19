import { createSystem } from '@mszr/vanity'
import { describe, expect, it } from 'vitest'
import { emitSystemCss } from '../compiler/projection/systemCss'
import { getSystemContract } from './contract'

interface RuleOptions {
  description?: string
  name?: string
  selector?: string
  value?: string
  layer?: string
  order?: number
  registration?: 'forward' | 'reverse'
  includeSecond?: boolean
}

function makeSystem(options: RuleOptions = {}) {
  const open = createSystem()
  const first = {
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.layer === undefined ? {} : { layer: options.layer }),
    ...(options.order === undefined ? {} : { order: options.order }),
    css: {
      [options.selector ?? 'html']: {
        '--identity-first': options.value ?? 'one',
      },
    },
  }
  const second = {
    css: {
      body: {
        '--identity-second': 'two',
      },
    },
  }
  const entries = options.includeSecond === false
    ? { [options.name ?? 'first']: first }
    : options.registration === 'reverse'
      ? { second, [options.name ?? 'first']: first }
      : { [options.name ?? 'first']: first, second }
  return open.addRules(entries).consolidate({
    prefix: 'identity',
    layerOrder: ['reset', 'tokens', 'recipes'],
  })
}

function contractOf(options?: RuleOptions) {
  const system = makeSystem(options)
  const contract = getSystemContract(system)
  if (contract === undefined)
    throw new Error('expected a system contract')
  return contract
}

function cssOf(options?: RuleOptions): string {
  return emitSystemCss(contractOf(options), { filePath: '/app/system.ts' }, 'debug').css
}

const namedRuleMutationExpectations = [
  {
    mutation: 'description',
    before: { description: 'old documentation' },
    after: { description: 'new documentation' },
    emittedCssChanges: false,
    identities: { compatibility: false, css: false, runtime: false, docs: true },
  },
  {
    mutation: 'rule name',
    before: { name: 'first' },
    after: { name: 'renamed' },
    emittedCssChanges: false,
    identities: { compatibility: true, css: false, runtime: false, docs: true },
  },
  {
    mutation: 'selector',
    before: { selector: 'html' },
    after: { selector: ':root' },
    emittedCssChanges: true,
    identities: { compatibility: true, css: true, runtime: false, docs: true },
  },
  {
    mutation: 'declaration value',
    before: { value: 'one' },
    after: { value: 'two' },
    emittedCssChanges: true,
    identities: { compatibility: true, css: true, runtime: false, docs: true },
  },
  {
    mutation: 'effective layer',
    before: {},
    after: { layer: 'tokens' },
    emittedCssChanges: true,
    identities: { compatibility: true, css: true, runtime: false, docs: true },
  },
  {
    mutation: 'effective order that changes output sequence',
    before: { order: -1 },
    after: { order: 1 },
    emittedCssChanges: true,
    identities: { compatibility: true, css: true, runtime: false, docs: true },
  },
  {
    mutation: 'omitted versus explicit effective default layer',
    before: {},
    after: { layer: 'reset' },
    emittedCssChanges: false,
    identities: { compatibility: false, css: false, runtime: false, docs: true },
  },
  {
    mutation: 'omitted versus explicit zero order',
    before: {},
    after: { order: 0 },
    emittedCssChanges: false,
    identities: { compatibility: false, css: false, runtime: false, docs: true },
  },
  {
    mutation: 'rule insertion',
    before: { includeSecond: false },
    after: {},
    emittedCssChanges: true,
    identities: { compatibility: true, css: true, runtime: false, docs: true },
  },
  {
    mutation: 'rule removal',
    before: {},
    after: { includeSecond: false },
    emittedCssChanges: true,
    identities: { compatibility: true, css: true, runtime: false, docs: true },
  },
  {
    mutation: 'equal-priority registration order',
    before: { registration: 'forward' },
    after: { registration: 'reverse' },
    emittedCssChanges: true,
    identities: { compatibility: true, css: true, runtime: false, docs: true },
  },
] as const

describe('named-rule identity projections', () => {
  it('matches emitted CSS and every identity projection against the mutation table', () => {
    for (const mutation of namedRuleMutationExpectations) {
      const before = contractOf(mutation.before)
      const after = contractOf(mutation.after)
      const beforeCss = emitSystemCss(before, { filePath: '/app/system.ts' }, 'debug').css
      const afterCss = emitSystemCss(after, { filePath: '/app/system.ts' }, 'debug').css

      expect(afterCss !== beforeCss, `${mutation.mutation}: emitted CSS`).toBe(mutation.emittedCssChanges)
      for (const identity of ['compatibility', 'css', 'runtime', 'docs'] as const) {
        expect(
          after.portable.identities[identity] !== before.portable.identities[identity],
          `${mutation.mutation}: ${identity} identity`,
        ).toBe(mutation.identities[identity])
      }
    }
  })

  it('keeps descriptions out of CSS, compatibility, and runtime identities', () => {
    const original = contractOf({ description: 'old documentation' })
    const edited = contractOf({ description: 'new documentation' })

    expect(cssOf({ description: 'old documentation' })).toBe(cssOf({ description: 'new documentation' }))
    expect(edited.portable.identities).toMatchObject({
      compatibility: original.portable.identities.compatibility,
      css: original.portable.identities.css,
      runtime: original.portable.identities.runtime,
    })
    expect(edited.portable.identities.docs).not.toBe(original.portable.identities.docs)
  })

  it('keeps rule names in contract/docs identity but out of emitted CSS identity', () => {
    const original = contractOf({ name: 'first' })
    const renamed = contractOf({ name: 'renamed' })

    expect(cssOf({ name: 'first' })).toBe(cssOf({ name: 'renamed' }))
    expect(renamed.portable.identities.compatibility).not.toBe(original.portable.identities.compatibility)
    expect(renamed.portable.identities.docs).not.toBe(original.portable.identities.docs)
    expect(renamed.portable.identities.css).toBe(original.portable.identities.css)
  })

  it('changes CSS and semantic identities for emitted rule changes', () => {
    const original = contractOf({ selector: 'html', value: 'one' })
    const selector = contractOf({ selector: ':root', value: 'one' })
    const declaration = contractOf({ selector: 'html', value: 'two' })
    const layer = contractOf({ layer: 'tokens' })
    const removed = contractOf({ includeSecond: false })

    for (const changed of [selector, declaration, layer, removed]) {
      expect(changed.portable.identities.css).not.toBe(original.portable.identities.css)
      expect(changed.portable.identities.compatibility).not.toBe(original.portable.identities.compatibility)
      expect(changed.portable.identities.docs).not.toBe(original.portable.identities.docs)
      expect(changed.portable.identities.runtime).toBe(original.portable.identities.runtime)
    }
  })

  it('includes effective order and registration order when they change CSS output', () => {
    const ordered = cssOf({ order: 1 })
    const reordered = cssOf({ order: -1 })
    const original = contractOf({ order: 1 })
    const changed = contractOf({ order: -1 })

    expect(ordered).not.toBe(reordered)
    expect(changed.portable.identities.css).not.toBe(original.portable.identities.css)
    expect(changed.portable.identities.compatibility).not.toBe(original.portable.identities.compatibility)

    const forward = contractOf({ registration: 'forward' })
    const reverse = contractOf({ registration: 'reverse' })
    expect(cssOf({ registration: 'forward' })).not.toBe(cssOf({ registration: 'reverse' }))
    expect(reverse.portable.identities.css).not.toBe(forward.portable.identities.css)
    expect(reverse.portable.identities.compatibility).not.toBe(forward.portable.identities.compatibility)
  })
})
