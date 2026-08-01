import type { VanityTokenDeclarations } from './types'
import { VanityError } from '../diagnostics'
import { isHandle } from '../internal/handle'
import { requireStyleModule } from '../internal/styleModule'
import { serializeStyleValue } from './values'

export const VANITY_DEFERRED_TDEC = Symbol.for('vanity.deferredTdec')

export interface VanityDeferredTokenDeclarations {
  readonly [VANITY_DEFERRED_TDEC]: object
}

/**
 * Build a custom-property declaration fragment from a token-shaped tree.
 * Registered non-inheriting properties are intentionally excluded because
 * descendant declaration fragments cannot override their semantics.
 */
export function tokenDeclarations<T extends object>(
  tokens: T,
  input: VanityTokenDeclarations<T>,
): Record<`--${string}`, string | number> {
  const file = requireStyleModule('tdec')
  const declarations: Record<string, string | number> = {}
  collect(tokens, input as object, [], declarations, file)
  return declarations
}

/**
 * Keep open-stage declaration data independent from the temporary preview
 * prefix. The locked rule compiler resolves this token-shaped payload against
 * the final graph when the utility is used in a style module.
 */
export function deferredTokenDeclarations<T extends object>(
  tokens: T,
  input: VanityTokenDeclarations<T>,
): VanityDeferredTokenDeclarations {
  validate(tokens, input as object, [])
  return Object.freeze(Object.defineProperty({}, VANITY_DEFERRED_TDEC, {
    enumerable: true,
    value: input,
  })) as VanityDeferredTokenDeclarations
}

export function deferredTokenDeclarationInput(value: object): object | undefined {
  return VANITY_DEFERRED_TDEC in value
    ? (value as VanityDeferredTokenDeclarations)[VANITY_DEFERRED_TDEC]
    : undefined
}

function collect(
  tokens: object,
  input: object,
  path: string[],
  declarations: Record<string, string | number>,
  file: string,
): void {
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined)
      continue

    const next = [...path, name]
    const token = (tokens as Record<string, unknown>)[name]
    if (token === undefined) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${next.join('.')} is not a token in this system`,
        path: next.join('.'),
        file,
      })
    }

    if (isHandle(token)) {
      const registration = (token as any).$register
      if (registration && typeof registration === 'object' && registration.inherits === false) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_OVERRIDE',
          message: `${next.join('.')} is registered with inherits: false and cannot participate in a descendant declaration fragment`,
          path: next.join('.'),
          file,
          fix: 'set this token at its registered owner, or register it with inheritance enabled',
        })
      }
      declarations[(token as any).$name] = serializeStyleValue(value, next.join('.'), { file })
      continue
    }

    if (!isPlainObject(value) || !isPlainObject(token)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${next.join('.')} is a token group — declare its tokens individually`,
        path: next.join('.'),
        file,
      })
    }
    collect(token, value, next, declarations, file)
  }
}

function validate(tokens: object, input: object, path: string[]): void {
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined)
      continue

    const next = [...path, name]
    const token = (tokens as Record<string, unknown>)[name]
    if (token === undefined) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${next.join('.')} is not a token in this system`,
        path: next.join('.'),
      })
    }

    if (isHandle(token)) {
      const registration = (token as any).$register
      if (registration && typeof registration === 'object' && registration.inherits === false) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_OVERRIDE',
          message: `${next.join('.')} is registered with inherits: false and cannot participate in a descendant declaration fragment`,
          path: next.join('.'),
          fix: 'set this token at its registered owner, or register it with inheritance enabled',
        })
      }
      continue
    }

    if (!isPlainObject(value) || !isPlainObject(token)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${next.join('.')} is a token group — declare its tokens individually`,
        path: next.join('.'),
      })
    }
    validate(token, value, next)
  }
}

function isPlainObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
