/**
 * Token declaration bundles bridge value-space tokens into the ordinary rule
 * grammar. They deliberately derive declarations lazily: reading a token does
 * not validate it as a property bundle until an author asks for `$dec`.
 */

import type { VanityInternalTokenHandle } from './handle'
import { isSelectorKey } from '../css/rule'
import { isCssProperty } from '../css/validation'
import { VanityError } from '../diagnostics'
import { isHandle } from './handle'

export interface VanityTokenDeclarationGrammar {
  /** Public condition names accepted by the bound class grammar. */
  readonly conditions?: ReadonlySet<string>
  /** Property aliases accepted by the bound class grammar. */
  readonly aliases?: Readonly<Record<string, string>>
  /** Source file used by normalized diagnostics when one is available. */
  readonly file?: string
}

/**
 * Install lazy `$dec` getters throughout one resolved token tree.
 *
 * Getters are configurable because a preview graph can first use the portable
 * CSS grammar and later be rebound to the final system's conditions/aliases.
 */
export function attachTokenDeclarationGetters(
  tree: object,
  grammar: VanityTokenDeclarationGrammar = {},
  path: readonly string[] = [],
): void {
  for (const [name, child] of Object.entries(tree)) {
    if (name.startsWith('$'))
      continue
    const nextPath = [...path, name]
    if (isHandle(child))
      defineLeafDeclaration(child, name, nextPath, grammar)
    else if (isRecord(child))
      attachTokenDeclarationGetters(child, grammar, nextPath)
  }

  defineGroupDeclaration(tree, path, grammar)
}

/** Install `$dec` on one logical clone while it is still mutable. */
export function attachLogicalTokenDeclarationGetter(
  value: object,
  path: readonly string[],
  grammar: VanityTokenDeclarationGrammar,
): void {
  if (isHandleLike(value)) {
    const name = path.at(-1) ?? ''
    defineLeafDeclaration(value, name, path, grammar)
  }
  else {
    defineGroupDeclaration(value, path, grammar)
  }
}

function defineLeafDeclaration(
  handle: object,
  name: string,
  path: readonly string[],
  grammar: VanityTokenDeclarationGrammar,
): void {
  let cached: Readonly<Record<string, object>> | undefined
  Object.defineProperty(handle, '$dec', {
    configurable: true,
    enumerable: false,
    get() {
      if (!isDeclarationProperty(name, grammar)) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_DECLARATION_BUNDLE',
          message: `$dec: '${path.join('.')}' ends in '${name}', which is neither a CSS property, custom property, nor configured alias`,
          path: [...path, '$dec'],
          file: grammar.file,
          fix: 'navigate to a token whose final path segment names a CSS property, custom property, or configured alias',
        })
      }
      cached ??= Object.freeze({ [name]: handle })
      return cached
    },
  })
}

function defineGroupDeclaration(
  group: object,
  path: readonly string[],
  grammar: VanityTokenDeclarationGrammar,
): void {
  let cached: Readonly<Record<string, unknown>> | undefined
  Object.defineProperty(group, '$dec', {
    configurable: true,
    enumerable: false,
    get() {
      if (cached)
        return cached

      const declarations: Record<string, unknown> = {}
      const invalid: string[] = []

      for (const [name, child] of Object.entries(group)) {
        if (name.startsWith('$'))
          continue
        if (isHandleLike(child)) {
          if (isDeclarationProperty(name, grammar))
            declarations[name] = child
          else
            invalid.push(name)
          continue
        }
        if (isRecord(child)) {
          if (grammar.conditions?.has(name) || isSelectorKey(name))
            declarations[name] = (child as { readonly $dec: unknown }).$dec
          else
            invalid.push(name)
        }
      }

      if (invalid.length > 0) {
        const subject = path.length === 0 ? 'the token root' : `'${path.join('.')}'`
        const names = invalid.map(name => `'${name}'`).join(', ')
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_DECLARATION_BUNDLE',
          message: `$dec: ${subject} has children (${names}) that are neither CSS properties nor registered conditions`,
          detail: [
            'A plain token namespace is not flattened because doing so would erase author intent.',
          ],
          path: [...path, '$dec'],
          file: grammar.file,
          fix: path.length === 0
            ? 'navigate to a leaf bundle (for example ds.t.text.body.$dec), or register/use a condition key'
            : `navigate to a leaf bundle under ${path.join('.')}.${
              invalid[0]
            }.$dec, or register/use the child as a condition`,
        })
      }

      cached = Object.freeze(declarations)
      return cached
    },
  })
}

function isDeclarationProperty(
  name: string,
  grammar: VanityTokenDeclarationGrammar,
): boolean {
  return name.startsWith('--')
    || Object.hasOwn(grammar.aliases ?? {}, name)
    || isCssProperty(name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`))
}

function isHandleLike(value: unknown): value is VanityInternalTokenHandle | (object & {
  readonly $path: string
  readonly $var: (...args: unknown[]) => string
}) {
  return isHandle(value)
    || (typeof value === 'function' && '$path' in value && '$var' in value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
