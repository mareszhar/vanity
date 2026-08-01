/**
 * The accumulating builder — the runtime-agnostic core.
 *
 * Proven properties:
 *   P1  ADDITIVE accumulation across an IMMUTABLE chain that stays fast at depth
 *   P2  a callback that SEES the accumulated shape (editor completions)
 *   P5  consolidate() returns a LOCKED surface with the mutation methods removed
 *
 * ┌─ THE PERFORMANCE RULE (proven in ../depth) ────────────────────────────────┐
 * │ Accumulate the shape as a PLAIN INTERSECTION on a single type parameter     │
 * │ (`S & Record<N, …>`). Apply type-fest's `Simplify` ONLY at read-sites       │
 * │ (callback params, the locked surface). The naive alternative —              │
 * │ `Simplify<Omit<S, k> & { … }>` at every step — explodes into TS2589         │
 * │ ("excessively deep") at ~40 chain links. The lean form survives 150+.       │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
import type { Simplify } from 'type-fest'
import type { Contribution, ContributionInput } from './contribution'
import type { AdditiveBrand, FieldInput, Guard, Requirement, Shape } from './patterns'

export interface Open<S extends Shape> {
  /**
   * P1 + P3: additively add a group. Each field value may be plain OR a callback
   * over tools. The reverse-mapped param `{ [K]: FieldInput<G[K]> }` (with G the
   * RESOLVED values) is what makes the callback's `tools` param contextually
   * typed — a plain `FieldInput<unknown>` constraint would collapse to `unknown`.
   */
  add: <const N extends string, const G extends Record<string, unknown>>(
    name: N,
    fields: { [K in keyof G]: FieldInput<G[K]> } & AdditiveBrand<S, N, G>,
  ) => Open<S & Record<N, G>>

  /** P2: a callback that sees the accumulated shape and returns more groups. */
  derive: <const Ext extends Shape>(build: (shape: Simplify<S>) => Ext) => Open<S & Ext>

  /** P4: pure requirement — the user must have provided this shape already. */
  expect: <const R extends Requirement>(requirement: Guard<S, R, R>) => Open<S>

  /**
   * P4 + P1: apply a contribution that both REQUIRES a shape and PROVIDES one.
   * Unmet requirement → the argument type collapses to the readable message.
   */
  use: <const R extends Requirement, const P extends Shape>(
    contribution: Guard<S, R, ContributionInput<R, P>>,
  ) => Open<S & P>

  /** P5: lock. The returned type has none of the methods above. */
  consolidate: () => Consolidated<S>
}

export interface Consolidated<S extends Shape> {
  readonly shape: Simplify<S>
  read: <const K extends keyof S>(group: K) => Simplify<S[K]>
  // deliberately: no add / derive / expect / use / consolidate
}

/** Start an empty open builder. Runtime is a stub — this spike probes TYPES. */
export declare function create(): Open<Record<never, never>>

/** Author a reusable contribution (declares what it needs and what it adds). */
export declare function contribution<const R extends Requirement, const P extends Shape>(
  c: Contribution<R, P>,
): Contribution<R, P>
