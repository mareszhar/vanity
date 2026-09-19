import type { VanitySystemRule } from './rules'
import { createSystem } from '@mszr/vanity'
import { describe, expect, it } from 'vitest'
import { emitSystemCss } from '../compiler/projection/systemCss'
import { getSystemContract } from './contract'

interface NamedRule {
  readonly layer?: string
  readonly order?: number
}

interface RuleVariant {
  readonly first?: NamedRule
  readonly second?: NamedRule
  readonly registration?: 'forward' | 'reverse'
  readonly layerOrder: readonly string[]
}

interface Projection {
  readonly css: string
  readonly cssIdentity: string
  readonly compatibilityIdentity: string
}

function project({
  first = {},
  second = {},
  registration = 'forward',
  layerOrder,
}: RuleVariant): Projection {
  const entries = {
    first: {
      css: { body: { '--named-rule-first': 'first' } },
      ...first,
    },
    second: {
      css: { body: { '--named-rule-second': 'second' } },
      ...second,
    },
  }
  const rules = registration === 'reverse'
    ? { second: entries.second, first: entries.first }
    : entries
  const system = createSystem()
    .addRules(rules)
    .consolidate({ prefix: 'named-rules', layerOrder })
  const contract = getSystemContract(system)
  if (contract === undefined)
    throw new Error('expected a consolidated system contract')

  return {
    css: emitSystemCss(contract, { filePath: '/app/system.ts' }, 'debug').css,
    cssIdentity: contract.portable.identities.css,
    compatibilityIdentity: contract.portable.identities.compatibility,
  }
}

function markerOrder(css: string): string[] {
  return [...css.matchAll(/--named-rule-(first|second):/g)].map(match => match[1]!)
}

const layerOrders = [
  ['reset', 'tokens', 'recipes'],
  ['tokens', 'recipes'],
  ['recipes', 'tokens'],
] as const

describe('named-rule effective semantics', () => {
  it('treats omitted layer as the global default, not the class layer', () => {
    for (const layerOrder of layerOrders) {
      const defaultLayer: string = (layerOrder as readonly string[]).includes('reset')
        ? 'reset'
        : layerOrder[0]
      const omitted = project({ layerOrder })
      const explicitDefault = project({
        first: { layer: defaultLayer },
        second: { layer: defaultLayer },
        layerOrder,
      })

      expect(explicitDefault.css, layerOrder.join(',')).toBe(omitted.css)
      expect(explicitDefault.cssIdentity, layerOrder.join(',')).toBe(omitted.cssIdentity)
      expect(explicitDefault.compatibilityIdentity, layerOrder.join(',')).toBe(omitted.compatibilityIdentity)

      for (const layer of layerOrder) {
        const explicit = project({ first: { layer }, layerOrder })
        const isGlobalDefault = layer === defaultLayer
        expect(explicit.css === omitted.css, `${layerOrder.join(',')} / ${layer}`).toBe(isGlobalDefault)
        expect(explicit.cssIdentity === omitted.cssIdentity, `${layerOrder.join(',')} / ${layer}`).toBe(isGlobalDefault)
        expect(explicit.compatibilityIdentity === omitted.compatibilityIdentity, `${layerOrder.join(',')} / ${layer}`).toBe(isGlobalDefault)
      }
    }
  })

  it('normalizes omitted and explicit zero order, and sorts signed orders before registration', () => {
    for (const layerOrder of layerOrders) {
      const omitted = project({ layerOrder })
      const zero = project({ first: { order: 0 }, second: { order: 0 }, layerOrder })
      expect(zero.css, layerOrder.join(',')).toBe(omitted.css)
      expect(zero.cssIdentity, layerOrder.join(',')).toBe(omitted.cssIdentity)
      expect(zero.compatibilityIdentity, layerOrder.join(',')).toBe(omitted.compatibilityIdentity)

      const negative = project({ first: { order: -1 }, second: { order: 0 }, layerOrder })
      const positive = project({ first: { order: 1 }, second: { order: 0 }, layerOrder })
      expect(markerOrder(negative.css)).toEqual(['first', 'second'])
      expect(markerOrder(positive.css)).toEqual(['second', 'first'])
      // A numeric change that preserves emitted declaration order affects the
      // structural contract, but not the CSS artifact identity.
      expect(negative.css).toBe(omitted.css)
      expect(negative.cssIdentity).toBe(omitted.cssIdentity)
      expect(negative.compatibilityIdentity).not.toBe(omitted.compatibilityIdentity)
      expect(positive.cssIdentity).not.toBe(omitted.cssIdentity)

      const reverseRegistration = project({
        first: { order: 0 },
        second: { order: 0 },
        registration: 'reverse',
        layerOrder,
      })
      expect(markerOrder(reverseRegistration.css)).toEqual(['second', 'first'])
      expect(reverseRegistration.cssIdentity).not.toBe(zero.cssIdentity)
      expect(reverseRegistration.compatibilityIdentity).not.toBe(zero.compatibilityIdentity)
    }
  })

  it('sorts by declared layer order before numeric order and registration', () => {
    const layerOrder = ['recipes', 'reset', 'tokens']
    const forward = project({
      first: { layer: 'tokens', order: -10 },
      second: { layer: 'recipes', order: 10 },
      layerOrder,
    })
    const reverse = project({
      first: { layer: 'tokens', order: -10 },
      second: { layer: 'recipes', order: 10 },
      registration: 'reverse',
      layerOrder,
    })

    expect(markerOrder(forward.css)).toEqual(['second', 'first'])
    expect(reverse.css).toBe(forward.css)
    expect(reverse.cssIdentity).toBe(forward.cssIdentity)
  })

  it('keeps within-rule declaration order in the CSS identity', () => {
    const projectRule = (css: VanitySystemRule['css']): Projection => {
      const system = createSystem()
        .addRule('ordered', { css })
        .consolidate({ prefix: 'named-rules', layerOrder: ['reset', 'tokens', 'recipes'] })
      const contract = getSystemContract(system)
      if (contract === undefined)
        throw new Error('expected a consolidated system contract')

      return {
        css: emitSystemCss(contract, { filePath: '/app/system.ts' }, 'debug').css,
        cssIdentity: contract.portable.identities.css,
        compatibilityIdentity: contract.portable.identities.compatibility,
      }
    }

    const declarationOrder = [
      projectRule({ body: { margin: '1px', marginTop: '2px' } }),
      projectRule({ body: { marginTop: '2px', margin: '1px' } }),
    ]
    const nestedSelectorOrder = [
      projectRule({ body: { '& > span': { margin: '1px', marginTop: '2px' } } }),
      projectRule({ body: { '& > span': { marginTop: '2px', margin: '1px' } } }),
    ]
    const atRuleOrder = [
      projectRule({ body: { '@media (min-width: 1px)': { margin: '1px', marginTop: '2px' } } }),
      projectRule({ body: { '@media (min-width: 1px)': { marginTop: '2px', margin: '1px' } } }),
    ]
    const fallbackOrder = [
      projectRule({ body: { position: ['-webkit-sticky', 'sticky'] } }),
      projectRule({ body: { position: ['sticky', '-webkit-sticky'] } }),
    ]

    for (const [first, second] of [
      declarationOrder,
      nestedSelectorOrder,
      atRuleOrder,
      fallbackOrder,
    ]) {
      expect(first.css).not.toBe(second.css)
      expect(first.cssIdentity).not.toBe(second.cssIdentity)
      expect(first.compatibilityIdentity).not.toBe(second.compatibilityIdentity)
    }
  })

  it('never assigns one CSS identity to different emitted bytes across the mutation matrix', () => {
    const variants: RuleVariant[] = []
    const orderPairs: readonly (readonly [number | undefined, number | undefined])[] = [
      [undefined, undefined],
      [0, 0],
      [-1, 0],
      [0, -1],
      [1, 0],
      [0, 1],
    ]

    for (const layerOrder of layerOrders) {
      variants.push({ layerOrder })
      for (const layer of layerOrder) {
        variants.push({ first: { layer }, layerOrder })
        variants.push({ first: { layer }, second: { layer }, layerOrder })
      }
      for (const [firstOrder, secondOrder] of orderPairs) {
        for (const registration of ['forward', 'reverse'] as const) {
          variants.push({
            first: firstOrder === undefined ? {} : { order: firstOrder },
            second: secondOrder === undefined ? {} : { order: secondOrder },
            registration,
            layerOrder,
          })
        }
      }
    }

    const projections = variants.map(project)
    for (const left of projections) {
      for (const right of projections) {
        if (left.cssIdentity === right.cssIdentity)
          expect(left.css).toBe(right.css)
      }
    }
  })
})
