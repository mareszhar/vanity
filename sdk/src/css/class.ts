import type { VanitySystemContext } from './context'
import type { VanityClassEmitter } from './types'
import { getDiagnosticSource } from '../diagnostics'
import { record } from '../introspect/records'
import { substrate } from '../substrate'
import { createLayerContext } from './context'
import { emitStyle } from './emit'
import { compileStyleRule } from './rule'

/** The canonical class emitter: one rule in, one stable class name out. */
export function createClassEmitter(
  system: VanitySystemContext,
  standard = false,
): VanityClassEmitter<string, string> {
  const emit = (rule: unknown, debugId?: string, useStandard = false): string => {
    const file = substrate.modules.requireStyleModule('class')
    if (useStandard && system.propertyAliases?.expose === 'aliases-only') {
      record({
        kind: 'escape',
        form: 'class.standard',
        file,
        detail: debugId ?? (isObject(rule) ? Object.keys(rule).slice(0, 3).join(', ') : 'class.standard()'),
      })
    }
    const compiled = compileStyleRule(rule, {
      ...system,
      ...(useStandard ? { propertyAliases: undefined } : {}),
      standardEmitterName: 'class.standard',
      file,
    })

    if (compiled.layer === 'overrides')
      record({ kind: 'escape', form: 'overrides', file, detail: debugId ?? 'class()', layer: compiled.layer })

    const className = emitStyle(compiled, debugId)
    const source = getDiagnosticSource()
    record({
      kind: 'style',
      file,
      class: className,
      ...(debugId === undefined ? {} : { name: debugId }),
      vars: collectReferencedVariables(compiled.units.flatMap(unit => Object.values(unit.declarations))),
      ...(source === undefined ? {} : source),
    })
    return className
  }

  const classEmitter = ((rule: unknown, debugId?: string) => emit(rule, debugId, standard)) as any
  const standardEmitter = ((rule: unknown, debugId?: string) => emit(rule, debugId, true)) as VanityClassEmitter<string, string>
  classEmitter.standard = standardEmitter
  classEmitter.layer = (name: string) => createClassEmitter(createLayerContext(system, name), standard)
  Object.assign(standardEmitter, {
    standard: standardEmitter,
    layer: (name: string) => createClassEmitter(createLayerContext(system, name), true),
  })
  return classEmitter as VanityClassEmitter<string, string>
}

function collectReferencedVariables(values: Array<string | number | Array<string | number>>): string[] {
  const vars = new Set<string>()
  for (const value of values.flat()) {
    for (const match of String(value).matchAll(/var\((--[\w-]+)/g))
      vars.add(match[1]!)
  }
  return [...vars]
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
