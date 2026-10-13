import type { CssNode } from 'css-tree'
import type { VanityAxisDefinition } from '../system/axes'
import type { VanityArm } from './rule'
import { generate, parse } from 'css-tree'

type Truth = boolean | undefined
const facts = new WeakMap<VanityAxisDefinition, Map<string, Set<string>>>()
const combineAllTruths = (values: Truth[]): Truth => values.includes(false) ? false : values.includes(undefined) ? undefined : true
const combineAnyTruths = (values: Truth[]): Truth => values.includes(true) ? true : values.includes(undefined) ? undefined : false
const negate = (value: Truth): Truth => value === undefined ? undefined : !value

function getConditionSignature(node: CssNode): string {
  if (node.type === 'AttributeSelector') {
    const value = node.value?.type === 'String' ? node.value.value : node.value?.name
    return `attribute:${generate(node.name)}:${node.matcher}:${value}:${node.flags}`
  }
  if (node.type === 'Selector')
    return `selector:${node.children.toArray().filter(child => child.type !== 'NestingSelector').map(getConditionSignature).join('|')}`
  return generate(node)
}

function getModeFacts(definition: VanityAxisDefinition): Map<string, Set<string>> {
  let result = facts.get(definition)
  if (result)
    return result
  result = new Map()
  const register = (node: CssNode, mode: string): void => {
    const key = getConditionSignature(node)
    const modes = result!.get(key) ?? new Set()
    modes.add(mode)
    result!.set(key, modes)
  }
  for (const [mode, trigger] of Object.entries(definition.modes)) {
    for (const arm of trigger.arms) {
      // A guarded selector alone cannot establish that the whole mode applies.
      if (arm.selector && !arm.media && !arm.supports && !arm.container && !arm.scopes?.length) {
        const selector = parse(arm.selector, { context: 'selectorList' })
        if (selector.type === 'SelectorList') {
          for (const branch of selector.children) {
            if (branch.type !== 'Selector')
              continue
            const nodes = branch.children.toArray().filter(node => node.type !== 'NestingSelector')
            if (nodes.length) {
              register(branch, mode)
              if (nodes.length === 1)
                register(nodes[0]!, mode)
            }
          }
        }
      }
      if (arm.media && (!arm.selector || definition.native?.kind === 'scheme')) {
        const media = parse(arm.media, { context: 'mediaQueryList' })
        if (media.type === 'MediaQueryList') {
          for (const query of media.children) {
            if (query.type !== 'MediaQuery')
              continue
            register(query, mode)
            const nodes = query.condition?.children.toArray()
            if (!query.modifier && nodes?.length === 1)
              register(nodes[0]!, mode)
          }
        }
      }
    }
  }
  facts.set(definition, result)
  return result
}

function evaluate(node: CssNode, known: Map<string, Set<string>>, mode: string): Truth {
  const modes = known.get(getConditionSignature(node))
  if (modes?.size === 1)
    return modes.has(mode)
  switch (node.type) {
    case 'NestingSelector':
    case 'Combinator':
      return true
    case 'SelectorList':
    case 'MediaQueryList':
      return combineAnyTruths(node.children.toArray().map(child => evaluate(child, known, mode)))
    case 'Selector':
      return combineAllTruths(node.children.toArray().map(child => evaluate(child, known, mode)))
    case 'PseudoClassSelector': {
      if (!node.children || !['is', 'where', 'not'].includes(node.name.toLowerCase()))
        return undefined
      const value = combineAnyTruths(node.children.toArray().map(child => evaluate(child, known, mode)))
      return node.name.toLowerCase() === 'not' ? negate(value) : value
    }
    case 'MediaQuery': {
      const value = combineAllTruths([node.mediaType === null || node.mediaType === 'all' ? true : undefined, node.condition ? evaluate(node.condition, known, mode) : true])
      return node.modifier === 'not' ? negate(value) : value
    }
    case 'Condition': {
      const alternatives: Truth[] = []
      let terms: Truth[] = []
      let negative = false
      for (const child of node.children) {
        if (child.type === 'Identifier') {
          if (child.name === 'or') {
            alternatives.push(combineAllTruths(terms))
            terms = []
          }
          else if (child.name === 'not') {
            negative = !negative
          }
          continue
        }
        const value = evaluate(child, known, mode)
        terms.push(negative ? negate(value) : value)
        negative = false
      }
      return combineAnyTruths([...alternatives, combineAllTruths(terms)])
    }
    default:
      return undefined
  }
}

/** Exclude only environments contradicted by the arm's actual CSS condition. */
export function createDeclarationEnvironmentFilter(arm: VanityArm, axes: Readonly<Record<string, VanityAxisDefinition>>) {
  const selector = arm.selector ? parse(arm.selector, { context: 'selectorList' }) : undefined
  const media = arm.media ? parse(arm.media, { context: 'mediaQueryList' }) : undefined
  return (when: Record<string, string>): boolean => Object.entries(when).every(([axis, mode]) => {
    const definition = axes[axis]
    if (!definition)
      return true
    const known = getModeFacts(definition)
    return (!selector || evaluate(selector, known, mode) !== false) && (!media || evaluate(media, known, mode) !== false)
  })
}
