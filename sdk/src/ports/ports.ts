/**
 * `ports()` — merge port/style fragments into one style object
 * ([spec-ports.md §2]). For imperative code outside a framework binding;
 * `usePorts(() => [a.dec(x), b.dec(y)])` already merges — wrapping the array
 * in `ports()` is redundant and the docs never show it.
 */

import type { VanityPortStyle } from './types'

/** Merge port/style fragments, skipping falsy entries. */
export function ports(
  ...styles: Array<VanityPortStyle | false | null | undefined>
): VanityPortStyle {
  return Object.assign({}, ...styles.filter(Boolean))
}
