/**
 * TYPE-LEVEL PATTERNS for a shape-accumulating builder.
 *
 * These are the pure, library-agnostic type utilities that a "define X, add it
 * to an evolving thing, later require that shape" API depends on. Nothing here
 * knows about any specific project — the names are deliberately neutral so the
 * patterns are reusable and educational on their own.
 *
 * Proven properties (see ../README.md and the tests):
 *   P3  a field may be a plain value OR a callback-over-context — both resolve
 *       to the same value type, synchronously, so the accumulated shape is exact
 *   P4  a structural, ADDITIVE requirement check whose failure is a READABLE
 *       message naming the missing piece (not generic type soup)
 */

// A Shape is an open map of named groups; each group is a map of named fields.
// (Neutral stand-in for "the axes / tokens / consts an engine accumulates".)
export type Shape = Record<string, Record<string, unknown>>

// ─── P3: a field is EITHER a value OR a callback that receives tools ──────────
// The callback form is what lets an authoring key be context-aware while the
// plain form stays terse. Both must land on the same resolved value type.
export interface Tools {
  readonly unit: (n: number) => string
}
export type FieldInput<V> = V | ((tools: Tools) => V)

export type ResolveField<F> = F extends (tools: Tools) => infer V ? V : F
export type ResolveGroup<G> = { [K in keyof G]: ResolveField<G[K]> }

// ─── P4: additive structural requirement + readable failure ──────────────────
// A requirement names, per group, the field names that MUST exist. EXTRA fields
// on the target are always fine (this is "target superset-of required").
export type Requirement = Record<string, readonly string[]>

// The fields a requirement asks for that the target group does not have.
// NOTE: `Need[number] extends infer F extends string ? …` distributes over the
// member union, so each missing name surfaces individually.
type MissingFields<Have, Need extends readonly string[]>
  = Need[number] extends infer F extends string
    ? F extends keyof Have ? never : F
    : never

// A human-readable description of everything unmet, or `never` when satisfied.
export type MissingIn<S, R extends Requirement> = {
  [G in keyof R]: G extends keyof S
    ? MissingFields<S[G], R[G]> extends infer F extends string
      ? [F] extends [never] ? never : `group '${G & string}' is missing field(s): ${F}`
      : never
    : `group '${G & string}' is not present`
}[keyof R]

/**
 * Turn a requirement into a parameter guard. When the shape SATISFIES the
 * requirement, `Guard` is the passthrough type `Pass`; when it does NOT, `Guard`
 * collapses to the readable message string(s) — so passing the real argument is
 * "not assignable to parameter of type '<the message>'".
 *
 * The tuple-wrap `[MissingIn<…>] extends [never]` is load-bearing: without it, a
 * satisfied requirement (MissingIn = never) hits `never extends string` (which is
 * `true`) and wrongly takes the error branch.
 */
export type Guard<S, R extends Requirement, Pass>
  = [MissingIn<S, R>] extends [never] ? Pass : MissingIn<S, R>

// ─── P6: ADDITIVE-ONLY — growth never redefines ──────────────────────────────
// Adding a NEW name is fine; re-adding an existing one is a mistake, and the
// same message-collapsing trick reports it AT THE CURSOR rather than at build.
export type DuplicateIn<S, N extends string, G> = N extends keyof S
  ? Extract<keyof G, keyof S[N]> extends infer D extends string
    ? [D] extends [never] ? never : `✗ '${N}.${D}' already exists — the shape is additive-only`
    : never
  : never

/**
 * Applied as an INTERSECTION, not a wrapping conditional: `Mapped & Brand`.
 * When nothing collides the brand is `unknown` (a no-op), so the mapped type
 * stays the primary shape and callback params keep their contextual typing.
 * A conditional wrapper (`[Dup] extends [never] ? Mapped : Msg`) type-checks
 * but DEFEATS contextual typing for callback fields — proven by P3's test.
 */
export type AdditiveBrand<S, N extends string, G>
  = [DuplicateIn<S, N, G>] extends [never] ? unknown : { readonly '✗ additive-only': DuplicateIn<S, N, G> }
