/**
 * The public authoring types: type the names ([patterns.md §2]). Property
 * names are csstype's camelCase; condition names flow in as a literal union
 * from the system; selector and at-rule keys are template-literal patterns, so
 * anything that is neither a property, a condition, a selector, nor an at-rule
 * errors at the offending key. Value *grammar* belongs to the build-time
 * parser, not to template-literal types.
 */

import type * as CSS from 'csstype'
import type {
  VanityBaseConditionName,
  VanityConditionKeyHover,
  VanityConditionKeyName,
} from '../system/conditions'
import type { VanityAuthoredColor, VanityColor, VanityTokenFallback, VanityTokenHandleAny } from '../tokens/types'
import type { VanityCssValue, VanityTokenInput } from '../values/types'

type CSSTypeProperties = CSS.Properties<number | (string & {})>

export type VanityCssPropertyName = keyof CSSTypeProperties

export type VanityPropertyAliasMap = Readonly<Record<string, VanityCssPropertyName>>
export type VanityPropertyAliasMode = 'both' | 'aliases-only'

/**
 * Anything carrying a `var()` reference — token handles and ports. Ports carry
 * the default in the reference (`var(--name, 0)`); tokens don't (`var(--name)`).
 * Both satisfy this structural type, so style values accept either.
 */
export interface VanityVarReference {
  readonly var: `var(--${string})`
}

/**
 * One declared value: the property's csstype grammar, a token handle, or a
 * color-helper expression (`alpha(t.color.ink, 0.42)`). Open-valued by
 * design — the token map guides, it never gates.
 */
export type VanityStyleValue<P extends VanityCssPropertyName = VanityCssPropertyName>
  = CSSTypeProperties[P] | VanityVarReference | VanityTokenInput | VanityColor<any> | VanityAuthoredColor | VanityCssValue | VanityOmit

declare const VANITY_RULE_CONDITION: unique symbol
declare const VANITY_FRAGMENT: unique symbol
declare const VANITY_OMIT: unique symbol

/** A deliberate hole in an ordered contribution list. */
export interface VanityOmit {
  readonly [VANITY_OMIT]: true
}

/**
 * A reusable, spreadable rule contribution. The brand is type-only; at
 * runtime a fragment is the authored object itself.
 */
interface VanityFragmentMark<C extends string> {
  readonly [VANITY_FRAGMENT]?: C
}

export type VanityFragment<C extends string = VanityBaseConditionName>
  = VanityNestedRule<C> & VanityFragmentMark<C>

/**
 * Opaque proof that a configured fragment has already been checked against
 * its system's rule vocabulary. This lets plugin-aware fragments travel
 * through recipe and anatomy contribution lists without widening those
 * families to arbitrary plugin keys.
 */
export interface VanityConfiguredFragment<C extends string> {
  readonly [VANITY_FRAGMENT]: C
}

type VanityConditionHover<Key extends string>
  = [VanityConditionKeyHover<Key>] extends [never]
    ? object
    : { readonly [VANITY_RULE_CONDITION]?: VanityConditionKeyHover<Key> }

/** A property-first condition map: `color: { base: …, hover: … }`. */
export type VanityPropertyArms<C extends string, V>
  = { base?: V }
    & { [Key in C as VanityConditionKeyName<Key>]?: V }

/**
 * What a template-pattern key may hold. Deliberately wider than the nested
 * rule alone: a computed key — `` [`${button} + ${button}`] `` — types as a
 * plain string index, and TypeScript then requires every pattern signature to
 * accept the whole object's value union. Literal keys stay fully checked (a
 * malformed nested rule still errors inside); the rest is the build
 * validator's job, which sees every key anyway.
 */
export type VanityRuleEntry<C extends string>
  = | VanityNestedRule<C>
    | VanityRuleScalar

type VanityRuleScalar
  = | string
    | number
    | VanityVarReference
    | VanityTokenInput
    | VanityColor<any>
    | VanityAuthoredColor
    | VanityCssValue
    | readonly (string | number | VanityVarReference | VanityTokenInput | VanityAuthoredColor | VanityCssValue)[]
    | undefined

/** Custom properties are plain keys; the escape audit sees them, `vars` ceremony doesn't exist. */
export interface VanityCustomProperties<C extends string> {
  [customProperty: `--${string}`]: VanityRuleEntry<C>
}

export type VanityDeclarations<C extends string> = {
  [P in VanityCssPropertyName]?:
    | VanityStyleValue<P>
    | readonly (CSSTypeProperties[P] | VanityVarReference | VanityTokenInput)[]
    | VanityPropertyArms<C, VanityStyleValue<P>>
} & VanityCustomProperties<C>

/** Selector keys: `&` anywhere, or an implicit-descendant form, native-nesting style. */
export interface VanitySelectorRules<C extends string> {
  [selector: `${string}&${string}`]: VanityRuleEntry<C>
  [selector: `.${string}`]: VanityRuleEntry<C>
  [selector: `#${string}`]: VanityRuleEntry<C>
  [selector: `[${string}`]: VanityRuleEntry<C>
  [selector: `:${string}`]: VanityRuleEntry<C>
  [selector: `*${string}`]: VanityRuleEntry<C>
  [selector: `>${string}`]: VanityRuleEntry<C>
  [selector: `+${string}`]: VanityRuleEntry<C>
  [selector: `~${string}`]: VanityRuleEntry<C>
  [selector: `${string} ${string}`]: VanityRuleEntry<C>
}

export interface VanityAtRules<C extends string> {
  [atRule: `@media ${string}`]: VanityRuleEntry<C>
  [atRule: `@supports ${string}`]: VanityRuleEntry<C>
  [atRule: `@container ${string}`]: VanityRuleEntry<C>
  '@starting-style'?: VanityNestedRule<C>
}

/** The recursive rule body: declarations, bare condition keys, selectors, at-rules. */
export type VanityNestedRule<C extends string>
  = VanityDeclarations<C>
    & {
      [Key in C as VanityConditionKeyName<Key>]?:
        VanityConditionHover<Key> & VanityNestedRule<C>
    }
    & VanitySelectorRules<C>
    & VanityAtRules<C>

/** What `css()` takes: a rule, optionally re-homed to another declared layer. */
export type VanityStyleRule<C extends string, _L extends string = string> = VanityNestedRule<C>

/** Ordered style input. Arrays concatenate contributions; they never deep-merge. */
export type VanityRuleInput<C extends string>
  = | VanityNestedRule<C>
    | VanityFragment<C>
    | VanityConfiguredFragment<C>
    | VanityOmit
    | false
    | null
    | undefined
    | readonly VanityRuleInput<C>[]

/** Token-shaped custom-property declarations. */
export type VanityTokenDeclarations<T> = {
  readonly [Key in keyof T as Key extends `$${string}` ? never : Key]?: T[Key] extends VanityTokenHandleAny
    ? VanityTokenFallback<T[Key]['$type']>
    : T[Key] extends object ? VanityTokenDeclarations<T[Key]> : never
}

// Alias declarations layer onto the stable standard grammar. Keeping the
// alias map shallow avoids cloning csstype's 870-property recursive graph for
// every engine/plugin chain while preserving exact keys and target values.
type VanityAliasDeclarations<
  C extends string,
  Aliases extends VanityPropertyAliasMap,
> = {
  [Alias in keyof Aliases]?: Aliases[Alias] extends VanityCssPropertyName
    ? | VanityStyleValue<Aliases[Alias]>
    | readonly (CSSTypeProperties[Aliases[Alias]] | VanityVarReference | VanityTokenInput)[]
    | VanityPropertyArms<C, VanityStyleValue<Aliases[Alias]>>
    : never
}

type VanityAliasedStyleRule<C extends string, _L extends string, Aliases extends VanityPropertyAliasMap>
  = VanityAliasedNestedRule<C, Aliases>

type VanityStrictAliasedStyleRule<C extends string, _L extends string, Aliases extends VanityPropertyAliasMap>
  = VanityStrictAliasedNestedRule<C, Aliases>

type VanityAliasedRuleEntry<C extends string, Aliases extends VanityPropertyAliasMap>
  = VanityAliasedNestedRule<C, Aliases> | VanityRuleScalar

type VanityStrictAliasedRuleEntry<C extends string, Aliases extends VanityPropertyAliasMap>
  = VanityStrictAliasedNestedRule<C, Aliases> | VanityRuleScalar

interface VanityAliasedSelectorRules<C extends string, Aliases extends VanityPropertyAliasMap> {
  [selector: `${string}&${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `.${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `#${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `[${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `:${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `*${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `>${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `+${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `~${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [selector: `${string} ${string}`]: VanityAliasedRuleEntry<C, Aliases>
}

interface VanityStrictAliasedSelectorRules<C extends string, Aliases extends VanityPropertyAliasMap> {
  [selector: `${string}&${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `.${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `#${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `[${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `:${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `*${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `>${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `+${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `~${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [selector: `${string} ${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
}

type VanityAliasedAtRules<C extends string, Aliases extends VanityPropertyAliasMap> = {
  [atRule: `@media ${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [atRule: `@supports ${string}`]: VanityAliasedRuleEntry<C, Aliases>
  [atRule: `@container ${string}`]: VanityAliasedRuleEntry<C, Aliases>
} & { '@starting-style'?: VanityAliasedNestedRule<C, Aliases> }

type VanityStrictAliasedAtRules<C extends string, Aliases extends VanityPropertyAliasMap> = {
  [atRule: `@media ${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [atRule: `@supports ${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
  [atRule: `@container ${string}`]: VanityStrictAliasedRuleEntry<C, Aliases>
} & { '@starting-style'?: VanityStrictAliasedNestedRule<C, Aliases> }

type VanityAliasedNestedRule<C extends string, Aliases extends VanityPropertyAliasMap>
  = VanityDeclarations<C>
    & VanityAliasDeclarations<C, Aliases>
    & {
      [Key in C as VanityConditionKeyName<Key>]?:
        VanityConditionHover<Key> & VanityAliasedNestedRule<C, Aliases>
    }
    & VanityAliasedSelectorRules<C, Aliases>
    & VanityAliasedAtRules<C, Aliases>

type VanityStrictAliasedNestedRule<C extends string, Aliases extends VanityPropertyAliasMap>
  = Omit<VanityDeclarations<C>, Aliases[keyof Aliases]>
    & VanityAliasDeclarations<C, Aliases>
    & {
      [Key in C as VanityConditionKeyName<Key>]?:
        VanityConditionHover<Key> & VanityStrictAliasedNestedRule<C, Aliases>
    }
    & VanityStrictAliasedSelectorRules<C, Aliases>
    & VanityStrictAliasedAtRules<C, Aliases>

type VanityAliasRuleKeyGuard<Rule, C extends string, L extends string, Aliases extends VanityPropertyAliasMap>
  = Exclude<keyof Rule, keyof VanityAliasedStyleRule<C, L, Aliases> | keyof VanityFragmentMark<C>> extends never
    ? unknown
    : { [P in Exclude<keyof Rule, keyof VanityAliasedStyleRule<C, L, Aliases> | keyof VanityFragmentMark<C>>]?: never }

type VanityStrictAliasRuleKeyGuard<Rule, C extends string, L extends string, Aliases extends VanityPropertyAliasMap>
  = (Exclude<keyof Rule, keyof VanityStrictAliasedStyleRule<C, L, Aliases> | keyof VanityFragmentMark<C>> extends never
    ? unknown
    : { [P in Exclude<keyof Rule, keyof VanityStrictAliasedStyleRule<C, L, Aliases> | keyof VanityFragmentMark<C>>]?: never })
  & { [P in keyof Rule & Aliases[keyof Aliases]]?: never }

type VanityPropertyAliasContribution<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> = | VanityAliasedStyleRule<C, L, Aliases>
  | VanityConfiguredFragment<C>
  | VanityOmit
  | false
  | null
  | undefined

type VanityStrictPropertyAliasContribution<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> = | VanityStrictAliasedStyleRule<C, L, Aliases>
  | VanityConfiguredFragment<C>
  | VanityOmit
  | false
  | null
  | undefined

type VanityPropertyAliasContributionGuard<
  Contribution,
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> = Contribution extends VanityOmit | VanityConfiguredFragment<C> ? unknown
  : Contribution extends object ? VanityAliasRuleKeyGuard<Contribution, C, L, Aliases>
    : unknown

type VanityStrictPropertyAliasContributionGuard<
  Contribution,
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> = Contribution extends VanityOmit | VanityConfiguredFragment<C> ? unknown
  : Contribution extends object ? VanityStrictAliasRuleKeyGuard<Contribution, C, L, Aliases>
    : unknown

type VanityPropertyAliasContributionsGuard<
  Contributions extends readonly unknown[],
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> = {
  readonly [Index in keyof Contributions]:
  VanityPropertyAliasContributionGuard<Contributions[Index], C, L, Aliases>
}

type VanityStrictPropertyAliasContributionsGuard<
  Contributions extends readonly unknown[],
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> = {
  readonly [Index in keyof Contributions]:
  VanityStrictPropertyAliasContributionGuard<Contributions[Index], C, L, Aliases>
}

// ─── Keyframes and font faces ────────────────────────────────────────────────

/**
 * A keyframe step is declaration-only: conditions and selectors are
 * semantically meaningless inside one, so the grammar refuses them at the key.
 */
export type VanityKeyframeStep = {
  [P in VanityCssPropertyName]?: VanityStyleValue<P> | readonly (CSSTypeProperties[P] | VanityVarReference | VanityTokenInput)[]
} & {
  [customProperty: `--${string}`]: string | number | VanityVarReference
}

export type VanityKeyframeTime = 'from' | 'to' | `${string}%`

export type VanityKeyframesRule = {
  [T in VanityKeyframeTime]?: VanityKeyframeStep
}

export type VanityFontFaceRule
  = Omit<CSS.AtRule.FontFaceFallback, 'src'> & Required<Pick<CSS.AtRule.FontFaceFallback, 'src'>>

// ─── The bound authoring functions ───────────────────────────────────────────

export type VanityRawValue = string | number | VanityVarReference | VanityTokenInput | VanityColor<any> | VanityAuthoredColor | VanityCssValue

export interface VanityRawEmitter<L extends string> {
  (css: string): void
  (strings: TemplateStringsArray, ...values: VanityRawValue[]): void
  readonly layer: <Layer extends L>(name: Layer) => VanityRawEmitter<Layer>
}

interface VanityCssMembers<C extends string, L extends string> {
  /** Full platform-property form, even when the primary alias policy is aliases-only. */
  standard: VanityClassEmitter<C, L>
  /** The escape hatch is CSS itself: parsed, validated, scoped under the class ([§8]). */
  raw: (strings: TemplateStringsArray, ...values: VanityRawValue[]) => string
  /** Bind this emitter to one declared layer. */
  layer: <Layer extends L>(name: Layer) => VanityCssFunction<C, Layer>
}

export interface VanityCssFunction<C extends string, L extends string> extends VanityCssMembers<C, L> {
  /** The style unit: a scoped class whose rules compile away ([spec-css.md §2]). */
  (rule: VanityRuleInput<C>, debugId?: string): string
}

/** The target spelling for one generated class. */
export interface VanityClassEmitter<C extends string, L extends string> {
  (rule: VanityRuleInput<C>, debugId?: string): string
  /** Full platform-property form, even when the primary alias policy is aliases-only. */
  readonly standard: VanityClassEmitter<C, L>
  readonly layer: <Layer extends L>(name: Layer) => VanityClassEmitter<C, Layer>
}

/** Explicit selector → ordered contribution map. */
export interface VanityRulesEmitter<C extends string, L extends string> {
  (rules: Readonly<Record<string, VanityRuleInput<C>>>): void
  readonly layer: <Layer extends L>(name: Layer) => VanityRulesEmitter<C, Layer>
}

/** Reusable rules with no new semantic wrapper. */
export interface VanityFragmentFactory<C extends string> {
  <const Rule extends VanityNestedRule<C>>(rule: Rule): Rule & VanityFragment<C>
  <const Contributions extends readonly VanityRuleInput<C>[]>(
    contributions: Contributions,
  ): Contributions
}

/** Alias-aware authoring form installed only by the optional property-alias plugin. */
export interface VanityPropertyAliasCssFunction<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> extends VanityCssMembers<C, L> {
  <const Rule extends VanityAliasedStyleRule<C, L, Aliases>>(
    rule: Rule
      & VanityAliasRuleKeyGuard<Rule, C, L, Aliases>,
    debugId?: string,
  ): string
}

export interface VanityPropertyAliasClassEmitter<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> {
  <const Rule extends VanityAliasedStyleRule<C, L, Aliases>>(
    rule: Rule & VanityAliasRuleKeyGuard<Rule, C, L, Aliases>,
    debugId?: string,
  ): string
  <const Contributions extends readonly VanityPropertyAliasContribution<C, L, Aliases>[]>(
    rule: Contributions
      & VanityPropertyAliasContributionsGuard<Contributions, C, L, Aliases>,
    debugId?: string,
  ): string
  (rule: VanityOmit | false | null | undefined, debugId?: string): string
  readonly standard: VanityClassEmitter<C, L>
  readonly layer: <Layer extends L>(name: Layer) => VanityPropertyAliasClassEmitter<C, Layer, Aliases>
}

/** Alias-aware selector-map emitter. */
export interface VanityPropertyAliasRulesEmitter<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> {
  <const Entries extends Readonly<Record<
    string,
    VanityPropertyAliasContribution<C, L, Aliases>
    | readonly VanityPropertyAliasContribution<C, L, Aliases>[]
  >>>(
    rules: Entries & {
      readonly [Selector in keyof Entries]: Entries[Selector] extends readonly unknown[]
        ? VanityPropertyAliasContributionsGuard<Entries[Selector], C, L, Aliases>
        : VanityPropertyAliasContributionGuard<Entries[Selector], C, L, Aliases>
    },
  ): void
  readonly layer: <Layer extends L>(name: Layer) => VanityPropertyAliasRulesEmitter<C, Layer, Aliases>
}

/** Alias-aware reusable rule data, including ordered contribution arrays. */
export interface VanityPropertyAliasFragmentFactory<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> {
  <const Rule extends VanityAliasedStyleRule<C, L, Aliases>>(
    rule: Rule & VanityAliasRuleKeyGuard<Rule, C, L, Aliases>,
  ): Rule & VanityConfiguredFragment<C>
  <const Contributions extends readonly VanityPropertyAliasContribution<C, L, Aliases>[]>(
    contributions: Contributions
      & VanityPropertyAliasContributionsGuard<Contributions, C, L, Aliases>,
  ): Contributions
}

/** Strict primary vocabulary: aliased target spellings disappear from completion. */
export interface VanityStrictPropertyAliasCssFunction<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> extends VanityCssMembers<C, L> {
  (
    rule: VanityStrictAliasedStyleRule<C, L, Aliases>,
    debugId?: string,
  ): string
}

export interface VanityStrictPropertyAliasClassEmitter<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> {
  (rule: VanityStrictAliasedStyleRule<C, L, Aliases>, debugId?: string): string
  <const Contributions extends readonly VanityStrictPropertyAliasContribution<C, L, Aliases>[]>(
    rule: Contributions
      & VanityStrictPropertyAliasContributionsGuard<Contributions, C, L, Aliases>,
    debugId?: string,
  ): string
  (rule: VanityOmit | false | null | undefined, debugId?: string): string
  readonly standard: VanityClassEmitter<C, L>
  readonly layer: <Layer extends L>(name: Layer) => VanityStrictPropertyAliasClassEmitter<C, Layer, Aliases>
}

/** Strict alias-aware selector-map emitter. */
export interface VanityStrictPropertyAliasRulesEmitter<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> {
  <const Entries extends Readonly<Record<
    string,
    VanityStrictPropertyAliasContribution<C, L, Aliases>
    | readonly VanityStrictPropertyAliasContribution<C, L, Aliases>[]
  >>>(
    rules: Entries & {
      readonly [Selector in keyof Entries]: Entries[Selector] extends readonly unknown[]
        ? VanityStrictPropertyAliasContributionsGuard<Entries[Selector], C, L, Aliases>
        : VanityStrictPropertyAliasContributionGuard<Entries[Selector], C, L, Aliases>
    },
  ): void
  readonly layer: <Layer extends L>(name: Layer) => VanityStrictPropertyAliasRulesEmitter<C, Layer, Aliases>
}

/** Strict alias-aware reusable rule data. */
export interface VanityStrictPropertyAliasFragmentFactory<
  C extends string,
  L extends string,
  Aliases extends VanityPropertyAliasMap,
> {
  <const Rule extends VanityStrictAliasedStyleRule<C, L, Aliases>>(
    rule: Rule & VanityStrictAliasRuleKeyGuard<Rule, C, L, Aliases>,
  ): Rule & VanityConfiguredFragment<C>
  <const Contributions extends readonly VanityStrictPropertyAliasContribution<C, L, Aliases>[]>(
    contributions: Contributions
      & VanityStrictPropertyAliasContributionsGuard<Contributions, C, L, Aliases>,
  ): Contributions
}

export type VanityGlobalCssFunction<C extends string, _L extends string>
  = (selector: string, rule: VanityRuleInput<C>) => void

export interface VanityKeyframesFunction<L extends string = string> {
  (steps: VanityKeyframesRule, debugId?: string): string
  readonly layer: <Layer extends L>(name: Layer) => VanityKeyframesFunction<Layer>
}

export interface VanityFontFaceFunction<L extends string = string> {
  (rule: VanityFontFaceRule, debugId?: string): string
  readonly layer: <Layer extends L>(name: Layer) => VanityFontFaceFunction<Layer>
}
