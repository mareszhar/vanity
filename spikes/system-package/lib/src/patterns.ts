/**
 * TYPE-LEVEL PATTERNS — the neutral utilities proven in spikes/type-accumulation,
 * restated so this spike stays self-contained (spikes import nothing from each
 * other or the product). This spike probes a different axis: what these types
 * look like AFTER `tsc --declaration` serializes them across a package boundary.
 */

export type Shape = Record<string, Record<string, unknown>>
export type Variants = Record<string, readonly string[]>

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

export type Guard<S, R extends Requirement, Pass>
  = [MissingIn<S, R>] extends [never] ? Pass : MissingIn<S, R>

export type DuplicateIn<S, N extends string, G> = N extends keyof S
  ? Extract<keyof G, keyof S[N]> extends infer D extends string
    ? [D] extends [never] ? never : `✗ '${N}.${D}' already exists — the shape is additive-only`
    : never
  : never

export type AdditiveBrand<S, N extends string, G>
  = [DuplicateIn<S, N, G>] extends [never] ? unknown : { readonly '✗ additive-only': DuplicateIn<S, N, G> }

export interface Contribution<R extends Requirement, P extends Shape> {
  readonly id: string
  readonly requires: R
  readonly provides: P
}

export type ContributionInput<R extends Requirement, P extends Shape> = Contribution<R, P>
