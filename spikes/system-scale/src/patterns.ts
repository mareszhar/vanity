/**
 * TYPE-LEVEL PATTERNS for a shape-accumulating builder — the same neutral
 * utilities proven in spikes/type-accumulation, restated here so this spike
 * stays self-contained (spikes import nothing from each other or the product).
 *
 * See ../../type-accumulation/README.md for the derivation of each rule; this
 * spike takes them as given and probes a DIFFERENT axis: realistic whole-system
 * scale (few links, wide payloads, several facets accumulating at once).
 */

// A Shape is an open map of named groups; each group is a map of named fields.
export type Shape = Record<string, Record<string, unknown>>

// Variant sets: name → ordered branch names (neutral stand-in for "axis → modes").
export type Variants = Record<string, readonly string[]>

// ─── Additive structural requirement + readable failure ──────────────────────
export type Requirement = Record<string, readonly string[]>

type MissingFields<Have, Need extends readonly string[]>
  = Need[number] extends infer F extends string
    ? F extends keyof Have ? never : F
    : never

export type MissingIn<S, R extends Requirement> = {
  [G in keyof R]: G extends keyof S
    ? MissingFields<S[G], R[G]> extends infer F extends string
      ? [F] extends [never] ? never : `group '${G & string}' is missing field(s): ${F}`
      : never
    : `group '${G & string}' is not present`
}[keyof R]

/** Collapse an unmet requirement into the readable message (tuple-wrapped!). */
export type Guard<S, R extends Requirement, Pass>
  = [MissingIn<S, R>] extends [never] ? Pass : MissingIn<S, R>

// ─── ADDITIVE-ONLY — growth never redefines ──────────────────────────────────
export type DuplicateIn<S, N extends string, G> = N extends keyof S
  ? Extract<keyof G, keyof S[N]> extends infer D extends string
    ? [D] extends [never] ? never : `✗ '${N}.${D}' already exists — the shape is additive-only`
    : never
  : never

/** Applied as an INTERSECTION (`Mapped & Brand`) to preserve contextual typing. */
export type AdditiveBrand<S, N extends string, G>
  = [DuplicateIn<S, N, G>] extends [never] ? unknown : { readonly '✗ additive-only': DuplicateIn<S, N, G> }

// ─── Contributions (the neutral analogue of a plugin) ────────────────────────
export interface Contribution<R extends Requirement, P extends Shape> {
  readonly id: string
  readonly requires: R
  readonly provides: P
}

export type ContributionInput<R extends Requirement, P extends Shape> = Contribution<R, P>
