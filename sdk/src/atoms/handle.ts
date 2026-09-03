/**
 * The context-shared atoms resolver: props in, precompiled classes out — a
 * runtime atoms call never synthesizes CSS ([patterns.md §1]). Shared by
 * the build-time factory (which emits the class tables and can still emit a
 * labeled escape on demand) and `/runtime` (which restores the handle from the
 * serialized tables) — so this module imports nothing build- or browser-specific.
 */

import type { VanityAtoms, VanityAtomsRuntime, VanityUnsafeValue } from './types'

const UNSAFE = Symbol.for('vanity.unsafeValue')

/**
 * The labeled escape from the finite atom set: `unsafe.value('37ch', 'editorial
 * measure')`. The reason is the point — exceptional CSS is sometimes correct,
 * and it should be findable, reviewable, and removable ([patterns.md §8]).
 */
export const unsafe = {
  value(value: string | number, reason: string): VanityUnsafeValue {
    const escape = { value, reason }
    Object.defineProperty(escape, UNSAFE, { value: true })
    return escape
  },
}

export function isUnsafeValue(value: unknown): value is VanityUnsafeValue {
  return typeof value === 'object' && value !== null && UNSAFE in value
}

/**
 * Emit the class for a labeled escape — provided by the build-time factory,
 * absent at runtime, where the variability diagnostic names the honest alternative.
 */
export type VanityUnsafeEmitter = (property: string, condition: string, escape: VanityUnsafeValue) => string

export function createAtomsHandle(runtime: VanityAtomsRuntime, emitUnsafe?: VanityUnsafeEmitter): VanityAtoms<Record<string, unknown>> {
  const warned = new Set<string>()

  const appendValue = (classes: string[], property: string, condition: string, value: unknown): void => {
    if (isUnsafeValue(value)) {
      if (emitUnsafe) {
        classes.push(emitUnsafe(property, condition, value))
      }
      else {
        warn(warned, `${property}:${condition}:unsafe`, `${getRuntimeName(runtime)}: an unsafe value reached a runtime call — `
        + `runtime data crosses through a port, not a finite atom set ([patterns.md §4])`)
      }

      return
    }

    const table = runtime.classes[property]
    const className = table?.[String(value)]?.[condition]

    if (className) {
      classes.push(className)
      return
    }

    const reason = table?.[String(value)]
      ? `the '${condition}' condition is not declared on these atoms`
      : `${JSON.stringify(value)} is not a declared ${property} value`

    warn(warned, `${property}:${condition}:${String(value)}`, `${getRuntimeName(runtime)}: ${reason}`)
  }

  const resolve = (props?: Record<string, unknown>): string => {
    const classes: string[] = []

    for (const [key, raw] of Object.entries(props ?? {})) {
      if (raw === undefined || raw === null || raw === false)
        continue

      if (key in runtime.toggles) {
        if (raw === true)
          classes.push(runtime.toggles[key])
        continue
      }

      const property = runtime.shorthands[key] ?? key

      if (!(property in runtime.classes)) {
        warn(warned, key, `${getRuntimeName(runtime)}: '${key}' is not a declared property, shorthand, or toggle`)
        continue
      }

      if (typeof raw === 'object' && !isUnsafeValue(raw)) {
        for (const [condition, value] of Object.entries(raw)) {
          if (value !== undefined)
            appendValue(classes, property, condition, value)
        }
        continue
      }

      appendValue(classes, property, 'base', raw)
    }

    return classes.join(' ')
  }

  return resolve as VanityAtoms<Record<string, unknown>>
}

function getRuntimeName(runtime: VanityAtomsRuntime): string {
  return runtime.name ?? 'atoms'
}

function warn(warned: Set<string>, key: string, message: string): void {
  // The literal `process.env.NODE_ENV` is what bundlers statically replace,
  // so production builds drop the validation entirely; the `typeof` guard
  // keeps a define-less browser from throwing.
  // eslint-disable-next-line node/prefer-global/process
  if (typeof process === 'undefined' || process.env.NODE_ENV === 'production')
    return

  if (warned.has(key))
    return

  warned.add(key)
  console.warn(`[vanity] ${message}`)
}
