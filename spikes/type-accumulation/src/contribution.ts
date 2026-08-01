/**
 * A reusable contribution — the neutral analogue of a "plugin": it declares a
 * shape it REQUIRES from wherever it is applied, and a shape it PROVIDES.
 * Requirements are checked structurally and additively at the application site.
 */
import type { Requirement, Shape } from './patterns'

export interface Contribution<R extends Requirement, P extends Shape> {
  readonly id: string
  readonly requires: R
  readonly provides: P
}

/** The input accepted at a `use(...)` site once the requirement is satisfied. */
export type ContributionInput<R extends Requirement, P extends Shape> = Contribution<R, P>
