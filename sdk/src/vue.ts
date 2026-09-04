/**
 * The Vue overlay ([spec-vue.md]): thin sugar over the core's currencies —
 * class strings and style-object fragments. Two composables, deliberately:
 * `usePorts` because reactivity needs a binding, `useAnatomy` because a record
 * of part classes silently loses reactivity without one. Single-class recipes
 * stay wrapper-free — `:class="button(props)"` inline is already reactive, and
 * no `useRecipe` exists (principle 10: a wrapper must carry something).
 */

import type { ComputedRef, CSSProperties, MaybeRefOrGetter, PropType } from 'vue'
import type { VanityPortStyle } from './ports/types'
import { computed, toValue } from 'vue'
import { ports } from './runtime'

export type VanityPortSource = VanityPortStyle | false | null | undefined
export type VanityPortSourceFactory = () => VanityPortSource | readonly VanityPortSource[]

/**
 * Bind port fragments to `:style` — everything `v-bind()` in CSS offers
 * (cascade-powered, no style recalc storms) with none of its limits: typed,
 * cross-file, rename-safe ([spec-vue.md §1]). Accepts a thunk returning
 * fragments (reactive) or plain fragments (static); the thunk's array **is**
 * the merge — no `ports()` wrapper inside. SSR-safe: the computed serializes
 * into the rendered `style` attribute ([spec-ports.md §6]).
 */
export function usePorts(
  source: VanityPortSource | readonly VanityPortSource[] | VanityPortSourceFactory,
): ComputedRef<CSSProperties> {
  return computed(() => {
    const value = typeof source === 'function' ? source() : source
    const styles = Array.isArray(value) ? value : [value]

    return ports(...styles) as CSSProperties
  })
}

/** What `propsOf` reads: the props carrier plus the runtime variant space every recipe and anatomy publishes. */
export interface VanityPropsSource<TProps extends object> {
  readonly props: TProps
  readonly variants: object
  readonly toggles: readonly string[]
}

/** The Vue props declaration `propsOf` builds — `defineProps` extracts `TProps` back out of it. */
export type VanityPropsOptions<TProps extends object> = {
  [K in keyof TProps]-?: { type: PropType<Exclude<TProps[K], undefined>> }
}

type VanityOptionMap = Readonly<Record<string, { type: unknown }>>
type VanityProjectedOptions<Source> = Source extends VanityPropsSource<infer Props>
  ? VanityPropsOptions<Props>
  : Source extends VanityOptionMap ? Source : never
type VanityUnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (value: infer Intersection) => void ? Intersection : never
export type VanityNamespacedPropsOptions<Sources extends Readonly<Record<string, VanityPropsSource<object> | VanityOptionMap>>>
  = VanityUnionToIntersection<{
    [Prefix in keyof Sources & string]: {
      [Key in keyof VanityProjectedOptions<Sources[Prefix]> & string as `${Prefix}-${Key}`]: VanityProjectedOptions<Sources[Prefix]>[Key]
    }
  }[keyof Sources & string]>

/** Compact callable surface for projecting recipe/anatomy variants into Vue runtime props. */
export interface VanityPropsProjector {
  <TProps extends object>(source: VanityPropsSource<TProps>): VanityPropsOptions<TProps>
  group: <const Sources extends Readonly<Record<string, VanityPropsSource<object> | VanityOptionMap>>>(
    sources: Sources,
  ) => VanityNamespacedPropsOptions<Sources>
}

/**
 * Build Vue runtime props from a recipe or anatomy without restating variants.
 * Use `propsOf.group({ button, card })` for namespaced multi-source props.
 */
export const propsOf = Object.assign((source: VanityPropsSource<object>) => {
  const options: Record<string, { type: unknown }> = {}

  for (const axis of Object.keys(source.variants))
    options[axis] = { type: String }

  for (const toggle of source.toggles)
    options[toggle] = { type: Boolean }

  return options as never
}, {
  group(sources: Readonly<Record<string, VanityPropsSource<object> | VanityOptionMap>>) {
    const namespaced: Record<string, { type: unknown }> = {}
    for (const [prefix, child] of Object.entries(sources)) {
      const projected = isPropsSource(child) ? propsOf(child) : child
      for (const [key, option] of Object.entries(projected))
        namespaced[`${prefix}-${key}`] = option
    }
    return namespaced as never
  },
}) as VanityPropsProjector

function isPropsSource(value: unknown): value is VanityPropsSource<object> {
  return (typeof value === 'object' || typeof value === 'function')
    && value !== null
    && 'variants' in value
    && 'toggles' in value
}

export type VanityAnatomyResolver<TProps extends object, TParts extends Record<string, string>>
  = (props?: TProps) => TParts

/**
 * The blessed one-liner for anatomy in Vue ([spec-vue.md §2]): a typed
 * `computed` that keeps part classes reactive — `d.content` in the template,
 * no `.value`, no repeated calls. The bare `const d = dialog(props)` computes
 * once and silently stops tracking; this is the one place the "a typed
 * function needs no wrapper" rule bends, because here the wrapper carries
 * reactivity, not ceremony. Accepts the reactive props object directly, a
 * getter, or nothing — the anatomy's defaults resolve.
 */
export function useAnatomy<TProps extends object, TParts extends Record<string, string>>(
  anatomy: VanityAnatomyResolver<TProps, TParts>,
  props?: MaybeRefOrGetter<TProps>,
): ComputedRef<TParts> {
  return computed(() => anatomy(props === undefined ? undefined : toValue(props)))
}
