/**
 * `css()` — the style unit ([spec-css.md §2]): CSS with an index. The
 * factory closes over the system's compiled conditions and layers; each call
 * resolves the evaluating style module, compiles, validates,
 * and emits — returning a class string whose rules compiled away.
 */

import type { VanityConditionArm } from '../system/conditions'
import type { VanityClassEmitter, VanityPropertyAliasCssFunction, VanityPropertyAliasMap, VanityPropertyAliasMode } from './types'
import { diagnosticSource, VanityError } from '../diagnostics'
import { record } from '../internal/inspect'
import { requireStyleModule } from '../internal/styleModule'
import { emitStyle } from './emit'
import { bindRaw } from './raw'
import { checkLayer, compileRule } from './rule'

/** Everything a bound authoring function needs from its system. */
export interface VanitySystemContext {
  conditions: Map<string, readonly VanityConditionArm[]>
  layers: readonly string[]
  /** Where `css()` rules land by default — the first non-reserved authoring layer. */
  defaultLayer: string
  /** Where `globalCss()` rules land by default. */
  globalDefaultLayer: string
  /** The system's root layer (its prefix) — every emitted rule nests under it. */
  layerRoot: string
  /** Optional alias policy contributed by a public engine plugin. */
  propertyAliases?: {
    aliases: VanityPropertyAliasMap
    expose: VanityPropertyAliasMode
  }
}

export function bindCss(
  system: VanitySystemContext,
  surface: 'css' | 'class' = 'css',
): VanityPropertyAliasCssFunction<string, string, VanityPropertyAliasMap> {
  const emit = (rule: unknown, debugId?: string, standard = false): string => {
    const file = requireStyleModule('class')
    if (standard && system.propertyAliases?.expose === 'aliases-only') {
      record({
        kind: 'escape',
        form: surface === 'class' ? 'class.standard' : 'css.standard',
        file,
        detail: debugId ?? (isObject(rule) ? Object.keys(rule).slice(0, 3).join(', ') : `${surface}.standard()`),
      })
    }
    const compiled = compileRule(rule, {
      ...system,
      ...(standard ? { propertyAliases: undefined } : {}),
      standardEmitterName: surface === 'class' ? 'class.standard' : 'css.standard',
      file,
    })

    // An overrides-layer style is a deliberate exception by convention
    // ([patterns.md §6/§8]) — inventoried, findable, removable.
    if (compiled.layer === 'overrides')
      record({ kind: 'escape', form: 'overrides', file, detail: debugId ?? 'class()', layer: compiled.layer })

    const className = emitStyle(compiled, debugId)
    const source = diagnosticSource()

    record({
      kind: 'style',
      file,
      class: className,
      ...(debugId === undefined ? {} : { name: debugId }),
      vars: referencedVars(compiled.units.flatMap(unit => Object.values(unit.declarations))),
      ...(source === undefined ? {} : source),
    })

    return className
  }

  const css = (rule: unknown, debugId?: string): string => emit(rule, debugId)
  const standard = (rule: unknown, debugId?: string): string => emit(rule, debugId, true)

  css.raw = bindRaw(system)
  css.standard = standard
  css.layer = (name: string) => bindCss(inDeclaredLayer(system, name), surface)
  Object.assign(standard, {
    standard,
    layer: (name: string) => bindClass(inDeclaredLayer(system, name), true),
  })
  return css as VanityPropertyAliasCssFunction<string, string, VanityPropertyAliasMap>
}

/** The target `ds.class` surface, without the superseded `css.raw` member. */
export function bindClass(system: VanitySystemContext, standard = false): VanityClassEmitter<string, string> {
  const css = bindCss(system, 'class') as any
  return (standard ? css.standard : css) as VanityClassEmitter<string, string>
}

export function inDeclaredLayer(system: VanitySystemContext, name: string): VanitySystemContext {
  const diagnostic = checkLayer(name, system.layers)
  if (diagnostic !== undefined)
    throw new VanityError(diagnostic)
  return { ...system, defaultLayer: name, globalDefaultLayer: name }
}

function referencedVars(values: Array<string | number | Array<string | number>>): string[] {
  const vars = new Set<string>()

  for (const value of values.flat()) {
    for (const match of String(value).matchAll(/var\((--[\w-]+)/g))
      vars.add(match[1])
  }

  return [...vars]
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
