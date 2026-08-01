export interface Color {
  readonly constructor: 'oklch'
}

export function oklch(_l: number, _c: number, _h: number): Color {
  return { constructor: 'oklch' }
}

export interface Restriction {
  readonly level: 'forbid' | 'discourage'
  readonly use?: string
  readonly reason?: string
  readonly enforce?: 'prospective' | 'retroactive'
}

type ForbiddenCall<Call, Use extends string>
  = Call extends (...args: infer Args) => infer Result
    ? (...args: Args & { readonly [Message in `Constructor is forbidden; use ${Use}`]: never }) => Result
    : never

export type BoundConstructors<Policy extends Restriction | undefined>
  = Policy extends { readonly level: 'forbid' }
    ? {
        readonly oklch: ForbiddenCall<
          typeof oklch,
          Policy['use'] extends string ? Policy['use'] : 'a permitted constructor'
        >
      }
    : { readonly oklch: typeof oklch }

export function violates(input: {
  readonly valueRevision: number
  readonly policyRevision: number
  readonly restriction: Restriction
}): boolean {
  return input.restriction.level === 'forbid'
    && (input.restriction.enforce === 'retroactive'
      || input.valueRevision > input.policyRevision)
}
