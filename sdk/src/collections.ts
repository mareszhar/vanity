/** Small, pure helpers that keep ordinary TypeScript collection work literal. */

import { VanityError } from './diagnostics'

type Entry = readonly [PropertyKey, unknown]

type ObjectFromEntries<Entries extends readonly Entry[]> = {
  [Item in Entries[number] as Item[0]]: Item[1]
}

/**
 * `Object.fromEntries` with literal keys and values preserved.
 *
 * Runtime semantics are exactly the platform helper; this only repairs the
 * standard library's intentionally broad return type.
 */
export function fromEntries<const Entries extends readonly Entry[]>(
  entries: Entries,
): ObjectFromEntries<Entries> {
  return Object.fromEntries(entries) as ObjectFromEntries<Entries>
}

/** Map an object's values without widening its literal keys. */
export function mapRecord<
  const Input extends Readonly<Record<PropertyKey, unknown>>,
  const Result,
>(
  input: Input,
  map: <Key extends keyof Input>(value: Input[Key], key: Key) => Result,
): { [Key in keyof Input]: Result } {
  return Object.fromEntries(
    Reflect.ownKeys(input).map(key => [key, map(input[key as keyof Input], key as keyof Input)]),
  ) as { [Key in keyof Input]: Result }
}

/** The integers `[0, length)`, ready for `map`/`flatMap`. */
export function range(length: number): number[] {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new VanityError({
      code: 'VANITY_COLLECTION_INVALID',
      message: `range() needs a non-negative safe integer; received ${length}`,
      path: ['length'],
      fix: 'pass a non-negative safe integer',
    })
  }
  return Array.from({ length }, (_, index) => index)
}
