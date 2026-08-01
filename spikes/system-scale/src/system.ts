/**
 * A MULTI-FACET accumulating builder at whole-system realism.
 *
 * Where spikes/type-accumulation proved the accumulation *pattern* on one type
 * parameter with tiny payloads and many links, this spike models what a real
 * system build looks like:
 *
 *   - THREE facets accumulating at once (groups S, variant sets V, helpers U) —
 *     every call re-instantiates the interface with all three params;
 *   - WIDE payloads: groups carry many fields, fields may be BRANCHED
 *     (per-variant records — the "token with modes" shape) or one level of
 *     NESTED subgroup (bounded nesting, per R1);
 *   - a realistic call mix: variant sets up front, contributions with
 *     requirements, batched helper additions, and periodic `derive` reads
 *     (each of which forces a Simplify instantiation, as real usage does);
 *   - `consolidate()` locking into a read surface (Simplify at read-sites).
 *
 * The lean rules from the first spike are OBEYED, not re-derived: plain
 * intersection accumulation on each facet param, Simplify only at read-sites,
 * guards by intersection.
 */
import type { Simplify } from 'type-fest'
import type { AdditiveBrand, Contribution, ContributionInput, Guard, Requirement, Shape, Variants } from './patterns'

export interface Open<S extends Shape, V extends Variants, U extends object> {
  /** Register a variant set (neutral "axis"). Additive-only: re-registering a name errors at the cursor. */
  variants: <const N extends string, const M extends readonly string[]>(
    name: N,
    branches: M & (N extends keyof V ? { readonly '✗ additive-only': `✗ variant set '${N}' already exists` } : unknown),
  ) => Open<S, V & Record<N, M>, U>

  /** Additively add a group of fields (plain, branched, or one-level nested). */
  group: <const N extends string, const G extends Record<string, unknown>>(
    name: N,
    fields: G & AdditiveBrand<S, N, G>,
  ) => Open<S & Record<N, G>, V, U>

  /** A callback that SEES the accumulated shape and contributes more groups. */
  derive: <const Ext extends Shape>(
    build: (t: Simplify<S>, variants: Simplify<V>) => Ext,
  ) => Open<S & Ext, V, U>

  /** Apply a contribution (requires a shape, provides one). Unmet → readable message. */
  use: <const R extends Requirement, const P extends Shape>(
    contribution: Guard<S, R, ContributionInput<R, P>>,
  ) => Open<S & P, V, U>

  /** Batch-add helper functions (neutral "utils"). */
  helpers: <const X extends object>(helpers: X) => Open<S, V, U & X>

  /** Lock. The returned surface has none of the methods above. */
  consolidate: () => Consolidated<S, V, U>
}

export interface Consolidated<S extends Shape, V extends Variants, U extends object> {
  readonly t: Simplify<S>
  readonly variants: Simplify<V>
  readonly helpers: Simplify<U>
  read: <const K extends keyof S>(group: K) => Simplify<S[K]>
}

/** Start an empty open builder. Runtime is a stub — this spike probes TYPES. */
export declare function createSystem(): Open<Record<never, never>, Record<never, never>, Record<never, never>>

/** Author a reusable contribution. */
export declare function contribution<const R extends Requirement, const P extends Shape>(
  c: Contribution<R, P>,
): Contribution<R, P>
