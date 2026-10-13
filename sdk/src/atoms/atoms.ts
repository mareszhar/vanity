/**
 * `atoms()` — the strict utility lane ([spec-css.md §1]), bound on
 * the system like `recipe` and `anatomy` so the condition grammar flows in
 * unchanged. Definition pre-generates one class per property
 * value per declared condition — bounded by construction — and the returned
 * resolver joins precompiled classes; a labeled escape emits on demand at
 * build time and redirects to the ports lane at runtime.
 */

import type { VanitySystemContext } from '../css/context'
import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityAtoms, VanityAtomsRuntime, VanityUnsafeValue } from './types'
import { createLayerContext, requireStyleModuleFile } from '../css/context'
import { emitStyle } from '../css/emit'
import { compileStyleRule } from '../css/rule'
import { serializeStyleValue } from '../css/values'
import { didYouMean, VanityError } from '../diagnostics'
import { substrate } from '../substrate'
import { createAtomsHandle } from './handle'

interface VanityAtomsOptionsLoose {
  properties?: Record<string, readonly (string | number)[] | Record<string, unknown>>
  shorthands?: Record<string, string>
  toggles?: Record<string, unknown>
  conditions?: readonly string[]
  layer?: string
}

export function bindAtoms(system: VanitySystemContext, placedLayer?: string) {
  const atoms = (options: VanityAtomsOptionsLoose, debugId?: string): VanityAtoms<Record<string, unknown>> => {
    const file = requireStyleModuleFile('atoms')
    const name = debugId ?? 'atoms'
    const diagnostics: VanityDiagnostic[] = []

    if (options.layer !== undefined) {
      throw new VanityError({
        code: 'VANITY_ATOMS_KEY_COLLISION',
        message: 'layer placement is emitter configuration, not atoms data',
        path: 'layer',
        file,
        fix: `use atoms.layer('${options.layer}')({ … }) or ds.inLayer(name).atoms({ … })`,
      })
    }
    const layer = placedLayer
      ?? (system.layers.includes('utilities') ? 'utilities' : system.defaultLayer)
    const conditions = options.conditions ?? []
    const properties = options.properties ?? {}
    const shorthands = options.shorthands ?? {}
    const toggles = options.toggles ?? {}

    for (const condition of conditions) {
      if (!system.conditions.has(condition)) {
        const suggestion = didYouMean(condition, [...system.conditions.keys()])
        diagnostics.push({
          code: 'VANITY_ATOMS_UNKNOWN_CONDITION',
          message: `'${condition}' is not a condition of this system${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
          path: `conditions.${condition}`,
          file,
          fix: 'declare it in createSystem({ conditions }), or drop it here',
        })
      }
    }

    // The three call-site namespaces share one key space; a collision would
    // make every call ambiguous, so it dies at definition.
    for (const [kind, names] of [['shorthand', Object.keys(shorthands)], ['toggle', Object.keys(toggles)]] as const) {
      for (const key of names) {
        if (key in properties) {
          diagnostics.push({
            code: 'VANITY_ATOMS_KEY_COLLISION',
            message: `the ${kind} '${key}' collides with the declared property '${key}'`,
            path: `${kind === 'shorthand' ? 'shorthands' : 'toggles'}.${key}`,
            file,
            fix: `rename the ${kind}`,
          })
        }
      }
    }

    if (diagnostics.length > 0)
      throw new VanityError(diagnostics)

    // The finite atom set is its own vocabulary. The declarations policy
    // governs component declarations, not the vocabulary's literal definitions.
    const ctx = { ...system, policies: system.policies && { ...system.policies, declarations: undefined }, defaultLayer: layer, file }

    // ── Pre-generate the bounded tables ──
    const classes: VanityAtomsRuntime['classes'] = {}

    for (const [property, values] of Object.entries(properties)) {
      const entries: Array<[string, unknown]> = Array.isArray(values)
        ? values.map(value => [String(value), value])
        : Object.entries(values)

      classes[property] = {}

      for (const [key, value] of entries) {
        classes[property][key] = {
          base: emitStyle(compileStyleRule({ [property]: value }, ctx), `${name}_${property}_${key}`),
        }

        for (const condition of conditions) {
          classes[property][key][condition] = emitStyle(
            compileStyleRule({ [condition]: { [property]: value } }, ctx),
            `${name}_${property}_${key}_${condition}`,
          )
        }
      }
    }

    const toggleClasses = Object.fromEntries(
      Object.entries(toggles).map(([toggle, rule]) => [
        toggle,
        emitStyle(compileStyleRule(rule as object, ctx), `${name}_${toggle}`),
      ]),
    )

    const runtime: VanityAtomsRuntime = {
      name,
      classes,
      shorthands: { ...shorthands },
      toggles: toggleClasses,
    }

    // ── The labeled escape, emitted on demand and memoized ──
    const unsafeClasses = new Map<string, string>()

    const emitUnsafe = (property: string, condition: string, escape: VanityUnsafeValue): string => {
      serializeStyleValue(escape, property, ctx)
      const key = `${property}\0${condition}\0${escape.value}`
      const memoized = unsafeClasses.get(key)

      if (memoized !== undefined)
        return memoized

      const declarations = condition === 'base'
        ? { [property]: escape }
        : { [condition]: { [property]: escape } }

      const className = emitStyle(compileStyleRule(declarations, { ...ctx, styleName: name }), `${name}_unsafe_${property}`)
      unsafeClasses.set(key, className)

      return className
    }

    const handle = createAtomsHandle(runtime, emitUnsafe)

    substrate.modules.registerFunctionSerialization(handle as unknown as (...args: unknown[]) => unknown, {
      importPath: '@mszr/vanity/runtime',
      importName: 'restoreAtoms',
      args: [runtime as unknown as Record<string, unknown>],
    })

    return handle
  }
  atoms.layer = (name: string) => {
    createLayerContext(system, name)
    return bindAtoms(system, name)
  }
  return atoms
}
