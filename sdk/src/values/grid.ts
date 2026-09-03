/** CSS Grid value functions, composed through the shared value protocol. */

import type { VanityCssInput, VanityCssValue } from './types'
import { defineCssOperation } from './extensions'
import { createCompositeNode, createInputNode, ExpressionValue } from './protocol'

export type VanityGridRepeat = number | 'auto-fill' | 'auto-fit'

const CORE_GRID = { id: 'org.vanity.core.grid', version: 1 } as const

// Advanced built-in dogfood: multiple typed dependencies and extension-owned
// serialization use exactly the public contract available to packages.
const minmaxOperation = defineCssOperation({
  inputs: ['unknown', 'unknown'],
  output: 'declaration',
  extension: CORE_GRID,
  source: { helper: 'grid.minmax' },
  serialize(context, minimum, maximum) {
    return `minmax(${context.serialize(minimum)}, ${context.serialize(maximum)})`
  },
})

/** A bounded grid track: `minmax(minimum, maximum)`. */
function createMinmax(minimum: VanityCssInput, maximum: VanityCssInput): VanityCssValue<string, 'declaration'> {
  return minmaxOperation(minimum, maximum)
}

/** Repeat one or more tracks by count or auto-placement mode. */
function createRepeat(count: VanityGridRepeat, ...tracks: [VanityCssInput, ...VanityCssInput[]]): VanityCssValue<string, 'declaration'> {
  if (typeof count === 'number' && (!Number.isInteger(count) || count < 1))
    throw new RangeError(`[vanity] grid.repeat() count must be a positive integer; received ${count}`)

  const parts: Array<string | ReturnType<typeof createInputNode>> = [`repeat(${count}, `]
  tracks.forEach((track, index) => {
    if (index > 0)
      parts.push(' ')
    parts.push(createInputNode(track))
  })
  parts.push(')')
  return new ExpressionValue(createCompositeNode({
    type: 'declaration',
    parts,
    source: { helper: 'grid.repeat' },
  }))
}

/** Join track fragments into a `grid-template-columns/rows` value. */
function createTemplate(...tracks: [VanityCssInput, ...VanityCssInput[]]): VanityCssValue<string, 'declaration'> {
  const parts: Array<string | ReturnType<typeof createInputNode>> = []
  tracks.forEach((track, index) => {
    if (index > 0)
      parts.push(' ')
    parts.push(createInputNode(track))
  })
  return new ExpressionValue(createCompositeNode({ type: 'declaration', parts, source: { helper: 'grid.template' } }))
}

/** Quote rows for `grid-template-areas`, rejecting ambiguous embedded quotes. */
function createAreas(...rows: [string, ...string[]]): VanityCssValue<string, 'declaration'> {
  for (const row of rows) {
    if (row.includes('"'))
      throw new TypeError('[vanity] grid.areas() rows cannot contain double quotes')
  }
  return new ExpressionValue(createCompositeNode({
    type: 'declaration',
    parts: rows.flatMap((row, index) => [index === 0 ? '' : ' ', `"${row}"`]),
    source: { helper: 'grid.areas' },
  }))
}

/** CSS Grid's value language, grouped because the functions compose together. */
export const grid = Object.freeze({ minmax: createMinmax, repeat: createRepeat, template: createTemplate, areas: createAreas })
