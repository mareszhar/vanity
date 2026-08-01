/**
 * The same multi-facet accumulating builder as spikes/system-scale, plus the
 * one thing this spike exists to probe: `portable()`, a BOUNDARY simplifier a
 * library would apply to its export so consumers receive a flattened surface
 * instead of the raw accumulated intersection.
 *
 * Open question this spike answers empirically: does declaration emit EVALUATE
 * `Simplify<S>` for a concrete export (flattened object type in the d.ts), or
 * does it keep the alias reference (making type-fest part of the public API)?
 */
import type { Simplify } from 'type-fest'
import type { AdditiveBrand, Contribution, ContributionInput, Guard, Requirement, Shape, Variants } from './patterns'

export interface Open<S extends Shape, V extends Variants, U extends object> {
  variants: <const N extends string, const M extends readonly string[]>(
    name: N,
    branches: M & (N extends keyof V ? { readonly '✗ additive-only': `✗ variant set '${N}' already exists` } : unknown),
  ) => Open<S, V & Record<N, M>, U>

  group: <const N extends string, const G extends Record<string, unknown>>(
    name: N,
    fields: G & AdditiveBrand<S, N, G>,
  ) => Open<S & Record<N, G>, V, U>

  derive: <const Ext extends Shape>(
    build: (t: Simplify<S>, variants: Simplify<V>) => Ext,
  ) => Open<S & Ext, V, U>

  use: <const R extends Requirement, const P extends Shape>(
    contribution: Guard<S, R, ContributionInput<R, P>>,
  ) => Open<S & P, V, U>

  helpers: <const X extends object>(helpers: X) => Open<S, V, U & X>

  consolidate: () => Consolidated<S, V, U>
}

export interface Consolidated<S extends Shape, V extends Variants, U extends object> {
  readonly t: Simplify<S>
  readonly variants: Simplify<V>
  readonly helpers: Simplify<U>
  read: <const K extends keyof S>(group: K) => Simplify<S[K]>
}

/**
 * The boundary surface a library exports: same reads as `Consolidated`, but
 * the facet params are already-simplified types, so nothing about the builder
 * chain (or its guards) appears in the consumer-facing type.
 */
export interface PortableSurface<T, V, H> {
  readonly t: T
  readonly variants: V
  readonly helpers: H
  read: <const K extends keyof T>(group: K) => T[K]
}

/** Boundary simplifier — apply at the export site, never per step. */
export declare function portable<S extends Shape, V extends Variants, U extends object>(
  c: Consolidated<S, V, U>,
): PortableSurface<Simplify<S>, Simplify<V>, Simplify<U>>

/** Start an empty open builder. Runtime is a stub — this spike probes TYPES + EMIT. */
export declare function createSystem(): Open<Record<never, never>, Record<never, never>, Record<never, never>>

export declare function contribution<const R extends Requirement, const P extends Shape>(
  c: Contribution<R, P>,
): Contribution<R, P>
