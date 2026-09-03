/**
 * Emitted names are a public, consumer-facing API ([spec-tokens.md §9]):
 * path-derived toKebab names under the system prefix, stable across builds.
 * The runtime rule here and the type-level `VanityKebab` must agree exactly —
 * both convert per character, so `brandSoft` → `brand-soft` everywhere.
 */

export function toKebab(segment: string): string {
  return segment.replace(/[A-Z]/g, upper => `-${upper.toLowerCase()}`)
}

export function getTokenName(prefix: string, path: readonly string[]): string {
  return `--${prefix}-${path.map(tokenSegment).join('-')}`
}

/**
 * Selector-named `$dec` subgroups still need standards-valid custom-property
 * names. Keep ordinary semantic paths readable and give raw selector segments
 * a deterministic collision-resistant identity.
 */
function tokenSegment(segment: string): string {
  if (!/[&\s>~+]/.test(segment) && !/^[.#:[*]/.test(segment))
    return toKebab(segment)
  return `selector-${hashStableValue(segment)}`
}

function hashStableValue(value: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
