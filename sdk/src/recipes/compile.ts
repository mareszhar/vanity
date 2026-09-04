/**
 * The build-side machinery `recipe()` and `anatomy()` share: arm compilation
 * (diagnostics aggregated across every arm, not thrown at the first),
 * selection validation for `defaults` and compound `when`, port publication
 * checks, and the defaults fold — the pieces that keep the two factories one
 * grammar ([spec-recipes.md §3], principle 5).
 */

import type { VanitySystemContext } from '../css/context'
import type { VanityCompiled, VanityRuleContext } from '../css/rule'
import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityRecipeRecord } from '../introspect/records'
import type { VanityPort } from '../ports/types'
import { compileStyleRule, getArmKey } from '../css/rule'
import { didYouMean, VanityError } from '../diagnostics'
import { isPort } from '../ports/port'

/** The rolling state one factory call accumulates. */
export interface VanityRecipeBuild {
  ctx: VanityRuleContext
  diagnostics: VanityDiagnostic[]
  layer: string
}

/** Resolve the recipe-level layer and seed the build state. */
export function startBuild(
  options: { layer?: unknown },
  system: VanitySystemContext,
  file: string,
  resolveScopedConditions?: VanityRuleContext['resolveScopedConditions'],
): VanityRecipeBuild {
  const diagnostics: VanityDiagnostic[] = []
  if (options.layer !== undefined) {
    diagnostics.push({
      code: 'VANITY_RECIPE_INVALID_KEY',
      message: 'layer placement is emitter configuration, not recipe data',
      path: 'layer',
      file,
      fix: `use recipe.layer('${String(options.layer)}')({ … }) or ds.inLayer(name).recipe({ … })`,
    })
  }

  return {
    ctx: { ...system, file, resolveScopedConditions },
    diagnostics,
    layer: system.defaultLayer,
  }
}

/**
 * Compile one arm, reporting into the build instead of throwing — every
 * mistake across every arm surfaces in one pass. A `layer` key inside an arm
 * is refused: a recipe lives in one layer, declared at its root.
 */
export function compileRecipeArm(build: VanityRecipeBuild, arm: unknown, path: string[]): VanityCompiled {
  const empty: VanityCompiled = { layer: build.layer, layerRoot: build.ctx.layerRoot, units: [] }

  if (arm === undefined || arm === null)
    return empty

  try {
    const compiled = compileStyleRule(arm, { ...build.ctx, rootPath: path })
    return { layer: build.layer, layerRoot: build.ctx.layerRoot, units: compiled.units }
  }
  catch (error) {
    if (error instanceof VanityError) {
      build.diagnostics.push(...error.diagnostics.map((diagnostic) => {
        if (diagnostic.path === undefined || diagnostic.path.at(-1) !== 'layer')
          return diagnostic
        return {
          ...diagnostic,
          code: 'VANITY_RECIPE_INVALID_KEY' as const,
          message: `${diagnostic.path.join('.')} — a recipe lives in one layer`,
          fix: 'choose the recipe emitter layer with recipe.layer(name) or ds.inLayer(name)',
        }
      }))
      return empty
    }

    throw error
  }
}

/**
 * Validate a `defaults` or compound `when` map against the declared variant
 * space — an unknown axis or value is a diagnostic naming the valid set.
 */
export function checkSelection(
  build: VanityRecipeBuild,
  selection: unknown,
  variants: Record<string, Record<string, unknown>>,
  toggles: Record<string, unknown>,
  path: string,
): Record<string, string | boolean> {
  const checked: Record<string, string | boolean> = {}

  if (selection === undefined || selection === null)
    return checked

  for (const [key, value] of Object.entries(selection)) {
    if (value === undefined)
      continue

    const at = `${path}.${key}`

    if (Object.hasOwn(variants, key)) {
      const values = Object.keys(variants[key])

      if (typeof value === 'string' && values.includes(value)) {
        checked[key] = value
      }
      else {
        build.diagnostics.push({
          code: 'VANITY_RECIPE_UNKNOWN_VALUE',
          message: `${at} is ${JSON.stringify(value)}, which ${key} does not declare — valid values: ${values.join(', ')}`,
          path: at,
          file: build.ctx.file,
        })
      }
      continue
    }

    if (Object.hasOwn(toggles, key)) {
      if (typeof value === 'boolean') {
        checked[key] = value
      }
      else {
        build.diagnostics.push({
          code: 'VANITY_RECIPE_UNKNOWN_VALUE',
          message: `${at} is ${JSON.stringify(value)}, but ${key} is a toggle — it takes true or false`,
          path: at,
          file: build.ctx.file,
        })
      }
      continue
    }

    const suggestion = didYouMean(key, [...Object.keys(variants), ...Object.keys(toggles)])
    build.diagnostics.push({
      code: 'VANITY_RECIPE_UNKNOWN_VARIANT',
      message: `${at} names no declared variant or toggle${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
      path: at,
      file: build.ctx.file,
      fix: suggestion ? `use '${suggestion}', or declare the variant` : 'declare it under variants or toggles',
    })
  }

  return checked
}

/** Publication is port handles only — anything else gets one clear diagnostic. */
export function checkPorts(build: VanityRecipeBuild, ports: unknown): Record<string, VanityPort<any, any>> {
  const checked: Record<string, VanityPort<any, any>> = {}

  if (ports === undefined || ports === null)
    return checked

  for (const [name, value] of Object.entries(ports)) {
    if (isPort(value)) {
      checked[name] = value
    }
    else {
      build.diagnostics.push({
        code: 'VANITY_RECIPE_INVALID_KEY',
        message: `ports.${name} is not a port — the ports key publishes handles declared with port()`,
        path: `ports.${name}`,
        file: build.ctx.file,
        fix: 'declare it in module scope — const gap = port(t.space.xs) — and publish that handle',
      })
    }
  }

  return checked
}

/** Throw once with everything the build collected — never a diagnostic drip. */
export function finishBuild(build: VanityRecipeBuild): void {
  if (build.diagnostics.length > 0)
    throw new VanityError(build.diagnostics)
}

// ─── The defaults fold ───────────────────────────────────────────────────────

/**
 * Whether `sibling` declares everything `target` declares, arm for arm —
 * the soundness condition for folding a default value into base: any other
 * choice must overwrite every folded declaration, or the fold would leak.
 */
export function isCovered(sibling: VanityCompiled, target: VanityCompiled): boolean {
  for (const unit of target.units) {
    const key = getArmKey(unit.arm)
    const matches = sibling.units.filter(candidate => getArmKey(candidate.arm) === key)

    if (matches.length === 0)
      return false

    for (const property of Object.keys(unit.declarations)) {
      if (!matches.some(match => Object.hasOwn(match.declarations, property)))
        return false
    }
  }

  return true
}

/** Merge compiled rules, later declarations winning per arm — the fold's mechanics. */
export function mergeCompiled(into: VanityCompiled, from: VanityCompiled): VanityCompiled {
  return {
    layer: into.layer,
    layerRoot: into.layerRoot,
    units: [...into.units, ...from.units],
  }
}

/** Join a debug id with an arm suffix; without one, the suffix still names the arm. */
export function getDebugName(debugId: string | undefined, ...suffix: string[]): string {
  return [debugId, ...suffix].filter(Boolean).join('_')
}

// ─── Introspection ───────────────────────────────────────────────────────────

/** The variant-space shape a recipe or anatomy records for the manifest. */
export function recordVariantShape(
  variants: Record<string, Record<string, unknown>>,
  toggles: Record<string, unknown>,
  defaults: Record<string, string | boolean>,
  ports: Record<string, VanityPort<any, any>>,
): Pick<VanityRecipeRecord, 'variants' | 'toggles' | 'defaults' | 'ports'> {
  return {
    variants: Object.fromEntries(Object.entries(variants).map(([axis, values]) => [axis, Object.keys(values)])),
    toggles: Object.keys(toggles),
    defaults,
    ports: Object.fromEntries(Object.entries(ports).map(([name, port]) => [name, port.name])),
  }
}
