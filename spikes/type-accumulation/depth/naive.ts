/**
 * NAIVE accumulation: `Simplify<Omit<S,'…'> & { … }>` at EVERY step. This is the
 * intuitive way to keep hovers clean — and it explodes into TS2589
 * ("excessively deep") at ~40 chain links. Kept as the negative control.
 */
import type { Simplify } from 'type-fest'

type Shape = Record<string, Record<string, unknown>>
type Empty = Record<never, never>
type MergeGroup<A, B> = Simplify<Omit<A, keyof B> & { [K in keyof B]: (K extends keyof A ? A[K] : Empty) & B[K] }>
type WithGroup<S extends Shape, N extends string, G> = Simplify<Omit<S, N> & { [K in N]: MergeGroup<S extends Record<N, infer X> ? X : Empty, G> }>

export interface Naive<S extends Shape> {
  add: <const N extends string, const G extends Record<string, unknown>>(
    name: N,
    fields: G,
  ) => Naive<WithGroup<S, N, G>>
  read: () => Simplify<S>
}

export declare function naive(): Naive<Empty>
