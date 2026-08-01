/** LEAN accumulation: plain intersection on one type param, no per-step Simplify. */
type Shape = Record<string, Record<string, unknown>>

export interface Lean<S extends Shape> {
  add: <const N extends string, const G extends Record<string, unknown>>(
    name: N,
    fields: G,
  ) => Lean<S & Record<N, G>>
  read: () => S
}

export declare function lean(): Lean<Record<never, never>>
