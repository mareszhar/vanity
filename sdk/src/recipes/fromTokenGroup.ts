/** Mechanical same-key variant/config tables derived from one resolved token group. */

import type { VanityTokenHandleAny } from '../tokens/types'
import { VanityError } from '../diagnostics'
import { isHandle } from '../tokens/handle'

export type VanityTokenGroup = Readonly<Record<string, VanityTokenHandleAny>>

type VanityTokenGroupKeys<Group> = Exclude<keyof Group & string, `$${string}`>
type VanityTokenGroupInput<Group> = {
  readonly [Key in VanityTokenGroupKeys<Group>]:
  Group[Key] extends VanityTokenHandleAny ? Group[Key] : never
}

/**
 * Map one resolved token group into a same-key recipe or configuration table.
 *
 * @example
 * `fromTokenGroup(ds.t.space, token => ({ padding: token }))`
 */
export function fromTokenGroup<
  const Group extends object,
  Result,
>(
  group: Group & VanityTokenGroupInput<Group>,
  map: <Key extends VanityTokenGroupKeys<Group>>(token: Group[Key], key: Key) => Result,
): { readonly [Key in VanityTokenGroupKeys<Group>]: Result } {
  if (typeof map !== 'function') {
    throw new VanityError({
      code: 'VANITY_RECIPE_INVALID_KEY',
      message: 'fromTokenGroup() needs a mapping callback',
      path: ['map'],
      fix: 'pass a function that maps each token and key to the desired result',
    })
  }

  const entries = Object.entries(group).map(([key, token]) => {
    if (!isHandle(token)) {
      throw new VanityError({
        code: 'VANITY_RECIPE_INVALID_KEY',
        message: `fromTokenGroup() expected '${key}' to be a resolved token handle`,
        path: [String(key)],
        fix: 'pass a resolved token group from a consolidated system',
      })
    }
    return [key, map(token as any, key as any)]
  })

  return Object.freeze(Object.fromEntries(entries)) as {
    readonly [Key in VanityTokenGroupKeys<Group>]: Result
  }
}
