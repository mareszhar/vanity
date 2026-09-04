/**
 * `recipe()` — variants compress state ([spec-recipes.md §1],
 * [patterns.md §7]). Per-arm emission plus a tiny lookup table: each
 * variant value, toggle, and compound entry compiles to its own class at
 * build time; the returned handle joins precompiled classes over resolved
 * props and never synthesizes CSS.
 *
 * Defaults compile into base where sound — a default value folds only when
 * every sibling value overwrites everything it declares, so the default case
 * costs no extra class and no other case inherits a leak.
 */

import type { VanitySystemContext } from '../css/context'
import type { VanityCompiled } from '../css/rule'
import type { VanityRecipe, VanityRecipeRuntime } from './types'
import { createLayerContext, requireStyleModuleFile } from '../css/context'
import { emitStyle } from '../css/emit'
import { getDiagnosticSource } from '../diagnostics'
import { record } from '../introspect/records'
import { substrate } from '../substrate'
import { checkPorts, checkSelection, compileRecipeArm, finishBuild, getDebugName, isCovered, mergeCompiled, recordVariantShape, startBuild } from './compile'
import { createRecipeHandle } from './handle'

interface VanityRecipeOptionsLoose {
  ports?: Record<string, unknown>
  base?: unknown
  variants?: Record<string, Record<string, unknown>>
  toggles?: Record<string, unknown>
  compound?: ReadonlyArray<{ when?: unknown, style?: unknown }>
  defaults?: unknown
  layer?: unknown
}

export function bindRecipe(system: VanitySystemContext) {
  const recipe = (options: VanityRecipeOptionsLoose, debugId?: string): VanityRecipe<Record<string, unknown>> => {
    const file = requireStyleModuleFile('recipe')
    const build = startBuild(options, system, file)

    const variants = options.variants ?? {}
    const toggles = options.toggles ?? {}

    // ── Compile every arm (diagnostics aggregate across all of them) ──
    let base = compileRecipeArm(build, options.base ?? {}, ['base'])

    const variantArms: Record<string, Record<string, VanityCompiled>> = {}

    for (const [axis, values] of Object.entries(variants)) {
      variantArms[axis] = {}

      for (const [value, arm] of Object.entries(values))
        variantArms[axis][value] = compileRecipeArm(build, arm, ['variants', axis, value])
    }

    const toggleArms = Object.fromEntries(
      Object.entries(toggles).map(([name, arm]) => [name, compileRecipeArm(build, arm, ['toggles', name])]),
    )

    const compound = (options.compound ?? []).map((entry, index) => ({
      when: checkSelection(build, entry.when, variants, toggles, `compound.${index}.when`),
      compiled: compileRecipeArm(build, entry.style ?? {}, ['compound', String(index), 'style']),
    }))

    const defaults = checkSelection(build, options.defaults, variants, toggles, 'defaults')
    const ports = checkPorts(build, options.ports)

    finishBuild(build)

    // ── Fold defaults into base where sound ──
    const folded = new Set<string>()

    for (const [axis, value] of Object.entries(defaults)) {
      if (typeof value !== 'string')
        continue

      const target = variantArms[axis][value]
      const siblings = Object.entries(variantArms[axis])
        .filter(([sibling]) => sibling !== value)
        .map(([, compiled]) => compiled)

      if (siblings.every(sibling => isCovered(sibling, target))) {
        base = mergeCompiled(base, target)
        folded.add(`${axis}.${value}`)
      }
    }

    // ── Emit: base owns the identity class; every other arm is its own class ──
    const baseClass = emitStyle(base, debugId)

    const variantClasses: Record<string, Record<string, string>> = {}

    for (const [axis, values] of Object.entries(variantArms)) {
      variantClasses[axis] = {}

      for (const [value, compiled] of Object.entries(values)) {
        variantClasses[axis][value] = folded.has(`${axis}.${value}`) || compiled.units.length === 0
          ? ''
          : emitStyle(compiled, getDebugName(debugId, axis, value))
      }
    }

    const toggleClasses = Object.fromEntries(
      Object.entries(toggleArms).map(([name, compiled]) => [
        name,
        compiled.units.length === 0 ? '' : emitStyle(compiled, getDebugName(debugId, name)),
      ]),
    )

    const compoundClasses = compound.map((entry, index) => ({
      when: entry.when,
      class: entry.compiled.units.length === 0
        ? ''
        : emitStyle(entry.compiled, getDebugName(debugId, 'compound', String(index))),
    }))

    // ── The handle: a resolver over the table, serialized for app code ──
    const runtime: VanityRecipeRuntime = {
      ...(debugId === undefined ? {} : { name: debugId }),
      base: baseClass,
      variants: variantClasses,
      toggles: toggleClasses,
      compound: compoundClasses,
      defaults,
      ports,
    }

    const handle = createRecipeHandle(runtime)

    record({
      kind: 'recipe',
      file,
      ...getDiagnosticSource(),
      ...(debugId === undefined ? {} : { name: debugId }),
      ...recordVariantShape(variants, toggles, defaults, ports),
    })

    substrate.modules.registerFunctionSerialization(handle as unknown as (...args: unknown[]) => unknown, {
      importPath: '@mszr/vanity/runtime',
      importName: 'restoreRecipe',
      args: [runtime as unknown as Record<string, string>],
    })

    return handle
  }
  recipe.layer = (name: string) => bindRecipe(createLayerContext(system, name))
  return recipe
}
