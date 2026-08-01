/** Mechanical same-key variant/config tables derived from one resolved token group. */

import type { VanityTokenHandleAny } from '../tokens/types'
import { isHandle } from '../internal/handle'

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
  if (typeof map !== 'function')
    throw new TypeError('[vanity] fromTokenGroup() needs a mapping callback')

  const entries = Object.entries(group).map(([key, token]) => {
    if (!isHandle(token))
      throw new TypeError(`[vanity] fromTokenGroup() expected '${key}' to be a resolved token handle`)
    return [key, map(token as any, key as any)]
  })

  return Object.freeze(Object.fromEntries(entries)) as {
    readonly [Key in VanityTokenGroupKeys<Group>]: Result
  }
}
