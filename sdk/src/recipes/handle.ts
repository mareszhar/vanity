/**
 * The context-shared recipe/anatomy resolvers: the most-executed lines in the
 * SDK. A call resolves among precompiled classes — it never synthesizes CSS
 * ([patterns.md §7]). Shared by the build-time factories (which emit the
 * classes and attach serialization) and `/runtime` (which restores handles
 * from the serialized table) — so this module imports nothing from either
 * application context, exactly like `ports/handle.ts`.
 */

import type { VanityAnatomy, VanityAnatomyRuntime, VanityRecipe, VanityRecipeRuntime } from './types'
import { explainable } from '../introspect/semantic'

/**
 * Resolve one axis choice. Unknown values arriving through an untyped edge
 * warn once with the valid set and fall back to the default — a wrong prop
 * never half-styles a component silently ([spec-recipes.md §4]).
 */
function choose(
  runtime: { name?: string, defaults: Record<string, string | boolean> },
  axis: string,
  values: Record<string, unknown>,
  raw: unknown,
  warned: Set<string>,
): string | undefined {
  const fallback = runtime.defaults[axis] as string | undefined

  if (raw === undefined || raw === null)
    return fallback

  const value = raw as string

  if (value in values)
    return value

  // The literal `process.env.NODE_ENV` is what bundlers statically replace,
  // so production builds drop the validation entirely; the `typeof` guard
  // keeps a define-less browser from throwing.
  // eslint-disable-next-line node/prefer-global/process
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    const key = `${axis}:${String(raw)}`

    if (!warned.has(key)) {
      warned.add(key)
      console.warn(`[vanity] ${runtime.name ?? 'recipe'}: ${axis} got ${JSON.stringify(raw)} — valid values: ${Object.keys(values).join(', ')}`)
    }
  }

  return fallback
}

/** Resolve the full selection: axis/toggle → chosen value, for classes and compound matching. */
function selectionOf(
  runtime: Pick<VanityRecipeRuntime, 'name' | 'defaults'> & { variants: Record<string, Record<string, unknown>>, toggles: Record<string, unknown> },
  props: Record<string, unknown> | undefined,
  warned: Set<string>,
): Record<string, string | boolean> {
  const selected: Record<string, string | boolean> = {}

  for (const [axis, values] of Object.entries(runtime.variants)) {
    const value = choose(runtime, axis, values, props?.[axis], warned)

    if (value !== undefined)
      selected[axis] = value
  }

  for (const name of Object.keys(runtime.toggles))
    selected[name] = Boolean(props?.[name] ?? runtime.defaults[name] ?? false)

  return selected
}

function matches(when: Record<string, string | boolean>, selected: Record<string, string | boolean>): boolean {
  return Object.entries(when).every(([key, value]) => selected[key] === value)
}

/** The metadata every handle publishes beside its resolver. */
function describe(runtime: VanityRecipeRuntime | VanityAnatomyRuntime): object {
  return {
    // The `props` type carrier's runtime value: the empty selection.
    props: Object.freeze({}),
    variants: Object.fromEntries(
      Object.entries(runtime.variants).map(([axis, values]) => [axis, Object.keys(values)]),
    ),
    toggles: Object.keys(runtime.toggles),
    defaults: runtime.defaults,
    ports: runtime.ports,
  }
}

/**
 * Build a recipe handle around its runtime table. The handle is a function
 * (props → class string) so the substrate's function serializer carries it
 * across the build/app boundary.
 */
export function createRecipeHandle(runtime: VanityRecipeRuntime): VanityRecipe<Record<string, unknown>> {
  const warned = new Set<string>()

  const resolve = (props?: Record<string, unknown>): string => {
    const selected = selectionOf(runtime, props, warned)
    const classes = [runtime.base]

    for (const [axis, values] of Object.entries(runtime.variants)) {
      const value = selected[axis]

      if (typeof value === 'string' && values[value])
        classes.push(values[value])
    }

    for (const [name, className] of Object.entries(runtime.toggles)) {
      if (selected[name] === true && className)
        classes.push(className)
    }

    for (const entry of runtime.compound) {
      if (entry.class && matches(entry.when, selected))
        classes.push(entry.class)
    }

    return classes.join(' ')
  }

  return explainable(Object.assign(resolve, describe(runtime), {
    toString: () => runtime.base,
  }) as unknown as VanityRecipe<Record<string, unknown>>, {
    id: `recipe:${runtime.name ?? runtime.base}`,
    kind: 'recipe',
    name: runtime.name ?? runtime.base,
    ...describe(runtime),
  })
}

/**
 * Build an anatomy handle: same resolution law, a typed record of part
 * classes out. Every declared part is present in the result — its stable
 * class anchors provenance even when a variant adds nothing to it.
 */
export function createAnatomyHandle(runtime: VanityAnatomyRuntime): VanityAnatomy<string, Record<string, unknown>> {
  const warned = new Set<string>()

  const resolve = (props?: Record<string, unknown>): Record<string, string> => {
    const selected = selectionOf(runtime, props, warned)
    const out: Record<string, string[]> = {}

    for (const [part, className] of Object.entries(runtime.parts))
      out[part] = [className]

    const add = (classesByPart: Record<string, string> | undefined): void => {
      for (const [part, className] of Object.entries(classesByPart ?? {})) {
        if (className)
          out[part]?.push(className)
      }
    }

    for (const [axis, values] of Object.entries(runtime.variants)) {
      const value = selected[axis]

      if (typeof value === 'string')
        add(values[value])
    }

    for (const [name, classesByPart] of Object.entries(runtime.toggles)) {
      if (selected[name] === true)
        add(classesByPart)
    }

    for (const entry of runtime.compound) {
      if (matches(entry.when, selected))
        add(entry.classes)
    }

    return Object.fromEntries(Object.entries(out).map(([part, classes]) => [part, classes.join(' ')]))
  }

  return explainable(Object.assign(resolve, describe(runtime), {
    parts: runtime.parts,
  }) as unknown as VanityAnatomy<string, Record<string, unknown>>, {
    id: `anatomy:${runtime.name ?? Object.values(runtime.parts)[0]}`,
    kind: 'anatomy',
    name: runtime.name ?? Object.values(runtime.parts)[0],
    parts: Object.keys(runtime.parts),
    ...describe(runtime),
  })
}
