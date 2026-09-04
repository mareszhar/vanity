/**
 * The public recipe and anatomy types ([spec-recipes.md]). Variants
 * compress state ([patterns.md §7]): the settled Stitches shape, kept
 * deliberately, with toggles as their own key and full condition support in
 * every arm.
 *
 * Two rules govern the types here:
 *
 * - **One signature with union-typed arms, never sibling overloads**
 *   ([patterns.md §10]) — a malformed options object reports a single
 *   diagnostic at the offending property.
 * - **Strict on literals, permissive on widened props** ([spec-recipes.md
 *   §4]): `button({ intnet: 'brand' })` dies at the cursor via excess-property
 *   checks; `button(props)` with a component's wider props object just works.
 *   Both fall out of one plain optional parameter, used as designed.
 */

import type {
  VanityConfiguredFragment,
  VanityNestedRule,
  VanityOmit,
  VanityRuleInput,
} from '../css/types'
import type { VanityPort } from '../ports/types'
import type {
  VanityConditionKeyName,
  VanityPartConditionKeyHover,
} from '../system/conditions'

/** Flatten an intersection so hovers read as one plain object, never an internals wall. */
export type VanityPrettify<T> = { [K in keyof T]: T[K] } & {}

/** The inferred empty default for variants, toggles, and ports. */
export type VanityNoInput = Record<never, never>

// ─── Recipe options ──────────────────────────────────────────────────────────

/**
 * One arm of a recipe — `base`, a variant value, a toggle, a compound `style`.
 * A full vanity rule: conditions, selectors, ports, composite tokens. No `layer`
 * key — a recipe lives in one layer, declared at the recipe root.
 */
export type VanityRecipeArm<C extends string> = VanityRuleInput<C>

/** The variant-space shapes `V` and `G` are inferred against — keys are the contract. */
export type VanityVariantsInput = Record<string, Record<string, unknown>>
export type VanityTogglesInput = Record<string, unknown>
export type VanityPortsInput = Record<string, VanityPort<any, any>>

/**
 * The declared variants, typed as a mapped shape over the inferred `V` whose
 * leaves are the rule grammar. `V` arrives by reverse mapped-type inference —
 * its *keys* are the variant space — while every arm literal is checked
 * against `VanityRecipeArm` directly, so a typo'd property dies at its key
 * (inferring the arms into `V` itself would launder them into legal keys).
 */
export type VanityVariantsOf<C extends string, V> = {
  [A in keyof V]: { [K in keyof V[A]]: VanityRecipeArm<C> }
}

export type VanityTogglesOf<C extends string, G> = { [K in keyof G]: VanityRecipeArm<C> }

/** A variant/toggle choice map — the shape of `when`, `defaults`, and call-site props. */
export type VanityRecipeSelection<V, G>
  = { -readonly [K in keyof V]?: keyof V[K] & string } & { -readonly [K in keyof G]?: boolean }

/** The inferred call-site props of a recipe or anatomy — also reachable as `VanityProps<typeof button>`. */
export type VanityRecipeProps<V, G> = VanityPrettify<VanityRecipeSelection<V, G>>

/** The typed variant map a recipe publishes: axis → its declared values. */
export type VanityVariantValues<V> = VanityPrettify<{ readonly [K in keyof V]: readonly (keyof V[K] & string)[] }>

/** One variant/toggle combination and the rule emitted when it matches. */
export interface VanityCompoundEntry<C extends string, V, G> {
  /** Typed against the declared variants and toggles — an impossible combination errors at the key. */
  when: VanityRecipeSelection<V, G>
  /** Rule applied for this combination. */
  style: VanityRecipeArm<C>
}

/** Options that declare a recipe's base rule, variants, toggles, compounds, and ports. */
export interface VanityRecipeOptions<C extends string, _L extends string, V, G, P> {
  /** Publication, not declaration: module-scope port handles become `button.ports.*` ([spec-recipes.md §2]). */
  ports?: P
  /** Base rule emitted for every recipe instance. */
  base?: VanityRecipeArm<C>
  /** Named variant values and their rules. */
  variants?: VanityVariantsOf<C, V>
  /** Boolean toggles and their rules. */
  toggles?: VanityTogglesOf<C, G>
  // `when` and `defaults` are checked against the declared space, never
  // inferred from — NoInfer keeps a typo'd key an error there, not a new axis.
  /** Rules for specific variant/toggle combinations, evaluated after base rules. */
  compound?: readonly VanityCompoundEntry<C, NoInfer<V>, NoInfer<G>>[]
  /** Variant and toggle values selected when callers omit props. */
  defaults?: NoInfer<VanityRecipeSelection<V, G>>
}

// ─── The recipe handle ───────────────────────────────────────────────────────

/**
 * What `recipe()` returns: a resolver from variant props to a class string,
 * carrying the variant space, defaults, and published ports. Interpolates in
 * selectors as its base class — every instance wears it.
 */
export interface VanityRecipe<
  TProps extends object = VanityNoInput,
  TVariants extends object = VanityNoInput,
  TToggle extends string = never,
  TPorts extends VanityPortsInput = VanityNoInput,
> {
  /** Props in, classes out — unknown keys ignored, defaults fill the gaps ([spec-recipes.md §4]). */
  (props?: TProps): string
  /**
   * The inferred call-site props, carried as a member so Vue's SFC compiler
   * can resolve them: `defineProps<(typeof button)['props'] & …>()`. The
   * runtime value is the empty selection (`{}`) — a legitimate inhabitant of
   * the all-optional props type, so the type stays honest.
   */
  readonly props: TProps
  /** The typed variant map: axis → declared values, for prop forwarding and docs. */
  readonly variants: TVariants
  readonly toggles: readonly TToggle[]
  readonly defaults: Readonly<Partial<TProps>>
  /** The component's published runtime style API ([spec-recipes.md §2]). */
  readonly ports: TPorts
  toString: () => string
}

/** The system-bound `recipe` — one signature, generics inferred from the options literal. */
export interface VanityRecipeFactory<C extends string, L extends string> {
  <
    V extends VanityVariantsInput = VanityNoInput,
    G extends VanityTogglesInput = VanityNoInput,
    const P extends VanityPortsInput = VanityNoInput,
  >(
    options: VanityRecipeOptions<C, L, V, G, P>,
    debugId?: string,
  ): VanityRecipe<VanityRecipeProps<V, G>, VanityVariantValues<V>, keyof G & string, P>
  readonly layer: <Layer extends L>(name: Layer) => VanityRecipeFactory<C, Layer>
}

/**
 * The everyday utility: the inferred variant props of a recipe or anatomy.
 * Indexed off the handle's `props` carrier — deliberately not a conditional
 * type, so the definition every tool reads is the same one Vue's SFC compiler
 * can follow. Inside `defineProps`, spell it `(typeof button)['props']` —
 * compiler-sfc resolves indexed access over `typeof`, but not (yet) generic
 * type aliases; the two forms are one type.
 */
export type VanityProps<T extends { props: object }> = T['props']

// ─── Anatomy options ─────────────────────────────────────────────────────────

/**
 * A part's rule: a full vanity rule plus part-scoped conditions — `'root:open'`
 * styles this part by another part's state, typed over the declared parts ×
 * the system's conditions ([spec-recipes.md §3]).
 */
declare const VANITY_PART_CONDITION: unique symbol

type VanityPartConditionHover<C extends string, Key extends string>
  = [VanityPartConditionKeyHover<C, Key>] extends [never]
    ? object
    : { readonly [VANITY_PART_CONDITION]?: VanityPartConditionKeyHover<C, Key> }

export type VanityAnatomyRule<C extends string, TPart extends string>
  = VanityNestedRule<C>
    & {
      [K in `${TPart}:${VanityConditionKeyName<C>}`]?:
        VanityPartConditionHover<C, K> & VanityNestedRule<C>
    }

export type VanityAnatomyRuleInput<C extends string, TPart extends string>
  = | VanityAnatomyRule<C, TPart>
    | VanityConfiguredFragment<C>
    | VanityOmit
    | false
    | null
    | undefined
    | readonly VanityAnatomyRuleInput<C, TPart>[]

/** One anatomy arm: rules keyed by part — an undeclared part errors at the key. */
export type VanityAnatomyArms<C extends string, TPart extends string> = {
  [K in TPart]?: VanityAnatomyRuleInput<C, TPart>
}

/** The anatomy twin of `VanityVariantsOf` — arms keyed by part, checked part by part. */
export type VanityAnatomyVariantsOf<C extends string, TPart extends string, V> = {
  [A in keyof V]: { [K in keyof V[A]]: VanityAnatomyArms<C, TPart> }
}

export type VanityAnatomyTogglesOf<C extends string, TPart extends string, G> = {
  [K in keyof G]: VanityAnatomyArms<C, TPart>
}

/** One anatomy variant/toggle combination and its per-part rules. */
export interface VanityAnatomyCompoundEntry<C extends string, TPart extends string, V, G> {
  /** Variant and toggle values that select this compound arm. */
  when: VanityRecipeSelection<V, G>
  /** Rules keyed by the anatomy part they style. */
  style: VanityAnatomyArms<C, TPart>
}

/** Options that declare named anatomy parts plus their shared variants and rules. */
export interface VanityAnatomyOptions<
  C extends string,
  _L extends string,
  TParts extends readonly string[],
  V,
  G,
  P,
> {
  /** The named parts, styled as one unit — *parts*, never "slots" ([language.md §3]). */
  parts: TParts
  /** Publish component-owned ports on the anatomy handle. */
  ports?: P
  /** Base rules keyed by anatomy part. */
  base?: VanityAnatomyArms<C, TParts[number]>
  /** Variant values whose rules are keyed by anatomy part. */
  variants?: VanityAnatomyVariantsOf<C, TParts[number], V>
  /** Boolean toggles whose rules are keyed by anatomy part. */
  toggles?: VanityAnatomyTogglesOf<C, TParts[number], G>
  /** Compound rules keyed by anatomy part. */
  compound?: readonly VanityAnatomyCompoundEntry<C, TParts[number], NoInfer<V>, NoInfer<G>>[]
  /** Variant and toggle values selected by default. */
  defaults?: NoInfer<VanityRecipeSelection<V, G>>
}

// ─── The anatomy handle ──────────────────────────────────────────────────────

/**
 * What `anatomy()` returns: same call-site law as a recipe, resolving to a
 * typed record of part classes. `parts` carries each part's stable class for
 * cross-file selector interpolation (`` [`${dialog.parts.content} &`] ``).
 */
export interface VanityAnatomy<
  TPart extends string,
  TProps extends object = VanityNoInput,
  TVariants extends object = VanityNoInput,
  TToggle extends string = never,
  TPorts extends VanityPortsInput = VanityNoInput,
> {
  (props?: TProps): Record<TPart, string>
  /** The inferred call-site props — the same carrier a recipe publishes. */
  readonly props: TProps
  /** Part → its stable class, for typed cross-file references. */
  readonly parts: Readonly<Record<TPart, string>>
  readonly variants: TVariants
  readonly toggles: readonly TToggle[]
  readonly defaults: Readonly<Partial<TProps>>
  readonly ports: TPorts
}

/** The system-bound `anatomy` — same grammar as `recipe`, with one added dimension. */
export interface VanityAnatomyFactory<C extends string, L extends string> {
  <
    const TParts extends readonly string[],
    V extends VanityVariantsInput = VanityNoInput,
    G extends VanityTogglesInput = VanityNoInput,
    const P extends VanityPortsInput = VanityNoInput,
  >(
    options: VanityAnatomyOptions<C, L, TParts, V, G, P>,
    debugId?: string,
  ): VanityAnatomy<TParts[number], VanityRecipeProps<V, G>, VanityVariantValues<V>, keyof G & string, P>
  readonly layer: <Layer extends L>(name: Layer) => VanityAnatomyFactory<C, Layer>
}

// ─── The serialized boundary crossing ────────────────────────────────────────

/**
 * What survives the build/app wall for a recipe: precompiled classes and the
 * resolution table — never a rule, never a stylesheet ([patterns.md §1]).
 * Ports ride along as handles with their own serializers.
 */
export interface VanityRecipeRuntime {
  /** The debug name, for dev-mode call-site warnings. */
  name?: string
  base: string
  /** Axis → value → class; `''` where the arm compiled into base or was empty. */
  variants: Record<string, Record<string, string>>
  toggles: Record<string, string>
  compound: ReadonlyArray<{ when: Record<string, string | boolean>, class: string }>
  defaults: Record<string, string | boolean>
  ports: Record<string, VanityPort<any, any>>
}

/** The anatomy equivalent — every class map keyed by part. */
export interface VanityAnatomyRuntime {
  name?: string
  /** Part → its stable class. */
  parts: Record<string, string>
  variants: Record<string, Record<string, Record<string, string>>>
  toggles: Record<string, Record<string, string>>
  compound: ReadonlyArray<{ when: Record<string, string | boolean>, classes: Record<string, string> }>
  defaults: Record<string, string | boolean>
  ports: Record<string, VanityPort<any, any>>
}
