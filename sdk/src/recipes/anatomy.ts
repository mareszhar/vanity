/**
 * `anatomy()` — the recipe pattern applied to parts ([spec-recipes.md §3],
 * [patterns.md §7]). Same options grammar as `recipe` with one added
 * dimension: every arm is keyed by part. Part classes are created first —
 * cross-part references need every class name before any rule compiles — and
 * `'<part>:<condition>'` keys compile to the ancestor-state selector, typed
 * over the declared parts × the system's conditions.
 */

import type { VanitySystemContext } from '../css/context'
import type { VanityCompiled, VanityScopedConditionResult } from '../css/rule'
import type { VanityConditionArm } from '../system/conditions'
import type { VanityAnatomy, VanityAnatomyRuntime } from './types'
import { createLayerContext } from '../css/context'
import { emitOnto, emitStyle } from '../css/emit'
import { isPlainObject, splitTopLevel } from '../css/rule'
import { didYouMean, getDiagnosticSource, VanityError } from '../diagnostics'
import { record } from '../introspect/records'
import { substrate } from '../substrate'
import { checkPorts, checkSelection, compileRecipeArm, covers, finishBuild, getDebugName, mergeCompiled, recordVariantShape, startBuild } from './compile'
import { createAnatomyHandle } from './handle'

interface VanityAnatomyOptionsLoose {
  parts?: unknown
  ports?: Record<string, unknown>
  base?: unknown
  variants?: Record<string, Record<string, unknown>>
  toggles?: Record<string, unknown>
  compound?: ReadonlyArray<{ when?: unknown, style?: unknown }>
  defaults?: unknown
  layer?: unknown
}

type PartArms = Record<string, VanityCompiled>

export function bindAnatomy(system: VanitySystemContext) {
  const anatomy = (options: VanityAnatomyOptionsLoose, debugId?: string): VanityAnatomy<string, Record<string, unknown>> => {
    const file = substrate.modules.requireStyleModule('anatomy')
    const parts = checkParts(options.parts, file)

    // ── Pass 1: every part gets its stable class before any rule compiles ──
    const partClasses: Record<string, string> = {}

    for (const part of parts)
      partClasses[part] = substrate.css.emitClassRule({ rule: {}, debugId: getDebugName(debugId, part) })

    const build = startBuild(options, system, file, getScopedConditionsOver(parts, partClasses, system))

    const variants = options.variants ?? {}
    const toggles = options.toggles ?? {}

    // ── Pass 2: compile every arm, keyed by part ──
    const compilePartArms = (arms: unknown, path: string[]): PartArms => {
      const compiled: PartArms = {}

      if (arms === undefined || arms === null)
        return compiled

      if (!isPlainObject(arms)) {
        build.diagnostics.push({
          code: 'VANITY_RECIPE_INVALID_KEY',
          message: `${path.join('.')} takes rules keyed by part`,
          path: path.join('.'),
          file,
        })
        return compiled
      }

      for (const [part, rule] of Object.entries(arms)) {
        if (!parts.includes(part)) {
          const suggestion = didYouMean(part, parts)
          build.diagnostics.push({
            code: 'VANITY_ANATOMY_UNKNOWN_PART',
            message: `${[...path, part].join('.')} is not a declared part — this anatomy has: ${parts.join(', ')}${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
            path: [...path, part].join('.'),
            file,
            fix: suggestion ? `use '${suggestion}', or add '${part}' to parts` : `add '${part}' to parts`,
          })
          continue
        }

        compiled[part] = compileRecipeArm(build, rule, [...path, part])
      }

      return compiled
    }

    const base = compilePartArms(options.base, ['base'])

    const variantArms: Record<string, Record<string, PartArms>> = {}

    for (const [axis, values] of Object.entries(variants)) {
      variantArms[axis] = {}

      for (const [value, arms] of Object.entries(values))
        variantArms[axis][value] = compilePartArms(arms, ['variants', axis, value])
    }

    const toggleArms = Object.fromEntries(
      Object.entries(toggles).map(([name, arms]) => [name, compilePartArms(arms, ['toggles', name])]),
    )

    const compound = (options.compound ?? []).map((entry, index) => ({
      when: checkSelection(build, entry.when, variants, toggles, `compound.${index}.when`),
      compiled: compilePartArms(entry.style, ['compound', String(index), 'style']),
    }))

    const defaults = checkSelection(build, options.defaults, variants, toggles, 'defaults')
    const ports = checkPorts(build, options.ports)

    finishBuild(build)

    // ── Fold defaults into the part bases where sound, part for part ──
    for (const [axis, value] of Object.entries(defaults)) {
      if (typeof value !== 'string')
        continue

      const target = variantArms[axis][value]
      const siblings = Object.entries(variantArms[axis])
        .filter(([sibling]) => sibling !== value)
        .map(([, arms]) => arms)

      const sound = Object.entries(target).every(([part, compiled]) =>
        siblings.every(sibling => covers(sibling[part] ?? { layer: compiled.layer, layerRoot: compiled.layerRoot, units: [] }, compiled)))

      if (sound) {
        for (const [part, compiled] of Object.entries(target))
          base[part] = mergeCompiled(base[part] ?? { layer: compiled.layer, layerRoot: compiled.layerRoot, units: [] }, compiled)

        variantArms[axis][value] = {}
      }
    }

    // ── Emit: bases onto the part classes; every other arm is its own class ──
    for (const part of parts) {
      if (base[part] !== undefined)
        emitOnto(partClasses[part], base[part])
    }

    const emitPartArms = (arms: PartArms, ...suffix: string[]): Record<string, string> => {
      const classes: Record<string, string> = {}

      for (const [part, compiled] of Object.entries(arms)) {
        if (compiled.units.length > 0)
          classes[part] = emitStyle(compiled, getDebugName(debugId, ...suffix, part))
      }

      return classes
    }

    const variantClasses: Record<string, Record<string, Record<string, string>>> = {}

    for (const [axis, values] of Object.entries(variantArms)) {
      variantClasses[axis] = {}

      for (const [value, arms] of Object.entries(values))
        variantClasses[axis][value] = emitPartArms(arms, axis, value)
    }

    const toggleClasses = Object.fromEntries(
      Object.entries(toggleArms).map(([name, arms]) => [name, emitPartArms(arms, name)]),
    )

    const compoundClasses = compound.map((entry, index) => ({
      when: entry.when,
      classes: emitPartArms(entry.compiled, 'compound', String(index)),
    }))

    // ── The handle: part classes out, serialized for app code ──
    const runtime: VanityAnatomyRuntime = {
      ...(debugId === undefined ? {} : { name: debugId }),
      parts: partClasses,
      variants: variantClasses,
      toggles: toggleClasses,
      compound: compoundClasses,
      defaults,
      ports,
    }

    const handle = createAnatomyHandle(runtime)

    record({
      kind: 'anatomy',
      file,
      ...getDiagnosticSource(),
      ...(debugId === undefined ? {} : { name: debugId }),
      parts,
      ...recordVariantShape(variants, toggles, defaults, ports),
    })

    substrate.modules.registerFunctionSerialization(handle as unknown as (...args: unknown[]) => unknown, {
      importPath: '@mszr/vanity/runtime',
      importName: 'restoreAnatomy',
      args: [runtime as unknown as Record<string, string>],
    })

    return handle
  }
  anatomy.layer = (name: string) => bindAnatomy(createLayerContext(system, name))
  return anatomy
}

// ─── Parts ───────────────────────────────────────────────────────────────────

function checkParts(parts: unknown, file: string): string[] {
  if (!Array.isArray(parts) || parts.length === 0 || !parts.every(part => typeof part === 'string' && part.length > 0)) {
    throw new VanityError({
      code: 'VANITY_ANATOMY_UNKNOWN_PART',
      message: 'an anatomy declares its parts as a non-empty array of names',
      path: 'parts',
      file,
      fix: 'declare the styled elements — parts: [\'root\', \'trigger\', \'content\']',
    })
  }

  const duplicate = parts.find((part, index) => parts.indexOf(part) !== index)

  if (duplicate !== undefined) {
    throw new VanityError({
      code: 'VANITY_ANATOMY_UNKNOWN_PART',
      message: `parts declares '${duplicate}' twice — a part is one named element`,
      path: 'parts',
      file,
    })
  }

  return parts
}

// ─── Part-scoped conditions ──────────────────────────────────────────────────

const partScopedKey = /^([A-Z_][\w-]*):([A-Z_][\w-]*)$/i

/**
 * `'<part>:<condition>'` — a part styled by another part's state
 * ([spec-recipes.md §3]). Each of the condition's arms is re-anchored:
 * its `&` becomes the referenced part's class and the styled element hangs
 * under it as a descendant. Conditions with no element selector (a bare media
 * query) hold no part state and are refused with the reason.
 */
function getScopedConditionsOver(
  parts: readonly string[],
  partClasses: Record<string, string>,
  system: VanitySystemContext,
): (key: string) => VanityScopedConditionResult | undefined {
  return (key) => {
    const match = partScopedKey.exec(key)

    if (match === null)
      return undefined

    const [, part, conditionName] = match
    const condition = system.conditions.get(conditionName)

    if (!parts.includes(part)) {
      // Only claim the key when the right half really is a condition —
      // anything else falls through to ordinary classification.
      if (condition === undefined)
        return undefined

      const suggestion = didYouMean(part, parts)

      return {
        diagnostic: {
          code: 'VANITY_ANATOMY_UNKNOWN_PART',
          message: `'${key}' scopes to '${part}', which is not a declared part — this anatomy has: ${parts.join(', ')}${suggestion ? ` — did you mean '${suggestion}:${conditionName}'?` : ''}`,
          path: key,
        },
      }
    }

    if (condition === undefined) {
      const suggestion = didYouMean(conditionName, [...system.conditions.keys()])

      return {
        diagnostic: {
          code: 'VANITY_ANATOMY_INVALID_CONDITION',
          message: `'${key}' — '${conditionName}' is not a condition of this system${suggestion ? ` — did you mean '${part}:${suggestion}'?` : ''}`,
          path: key,
        },
      }
    }

    const arms: VanityConditionArm[] = []

    for (const arm of condition) {
      if (arm.selector === undefined) {
        return {
          diagnostic: {
            code: 'VANITY_ANATOMY_INVALID_CONDITION',
            message: `'${key}' — '${conditionName}' holds no element state, so scoping it to a part means nothing`,
            path: key,
            fix: `write it as a plain condition: ${conditionName}: { … }`,
          },
        }
      }

      arms.push({
        ...arm,
        selector: splitTopLevel(arm.selector, ',')
          .map(selectorPart => `${selectorPart.replaceAll('&', partClasses[part])} &`)
          .join(', '),
      })
    }

    return { arms }
  }
}
