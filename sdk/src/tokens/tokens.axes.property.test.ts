/**
 * Axis-composition property evidence.
 *
 * This test reads the CSS that the token emitter actually writes. It models
 * the small selector and layer vocabulary emitted by axis declarations, then
 * compares the winning custom properties with a fresh `resolveGraph` result
 * for every reachable axis state. Keeping the carrier in the assertion is
 * important: semantic coverage alone cannot catch an address that matches a
 * larger set after it moves into a later cascade layer.
 */

import type { VanityFlatNode } from '../css/compile'
import type { VanitySystemMap } from '../introspect/system'
import type { TokenGraph, VanityLeafDefinition } from './module'
import {
  color,
  colorSchemes,
  createSystem,
  data,
  media,
  selector,
} from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { parseBlocks } from '../css/compile'
import { substrate } from '../substrate'
import { getTokenGraph } from './module'
import { resolveGraph } from './resolve'

type AxisSelection = Readonly<Record<string, string>>
type Specificity = readonly [number, number, number]

interface BuiltSystem {
  readonly css: string
  readonly graph: TokenGraph
  readonly semantic: VanitySystemMap
}

interface EmittedDeclaration {
  readonly layer: string
  readonly layerOrder: number
  readonly selector: string
  readonly media: readonly string[]
  readonly property: string
  readonly value: string
  readonly specificity: Specificity
  readonly sourceOrder: number
}

interface SelectorState {
  readonly axes: AxisSelection
}

type ArmShape = 'explicit' | 'fallback' | 'media'
type ArmShapeAssignment = readonly ArmShape[]
type DependentShape = 'own' | 'dependency' | 'both' | 'chained' | 'live'

function inSystemScope<T>(body: () => T): T {
  return substrate.modules.runInFileScope({
    filePath: 'src/tokens/tokens.axes.property.system.ts',
    packageName: '@vanity/fixture',
  }, body)
}

function emitSystem<T extends { readonly class: unknown }>(system: T): T {
  void system.class
  return system
}

function asBuiltSystem(result: { readonly css: string, readonly returned: unknown }): BuiltSystem {
  const system = result.returned as { readonly t: object, readonly introspect: () => VanitySystemMap }
  const graph = getTokenGraph(system.t)
  if (graph === undefined)
    throw new Error('property fixture did not return a token graph')
  return { css: result.css, graph, semantic: system.introspect() }
}

function axisModeProduct(graph: TokenGraph): readonly AxisSelection[] {
  let combinations: AxisSelection[] = [{}]
  for (const axis of graph.axes?.order ?? []) {
    const definition = graph.axes!.definitions[axis]!
    combinations = combinations.flatMap(when => definition.modeOrder.map((mode: string) => ({
      ...when,
      [axis]: mode,
    })))
  }
  return combinations
}

function selectAxisBranches(
  graph: TokenGraph,
  when: AxisSelection,
): Map<string, VanityLeafDefinition> {
  const substitutions = new Map<string, VanityLeafDefinition>()
  for (const node of graph.nodes.values()) {
    let selected: VanityLeafDefinition | undefined
    for (const axis of graph.axes?.order ?? []) {
      const mode = when[axis]
      if (mode === undefined)
        continue
      const branch = node.branches.find(candidate => candidate.kind === 'axis'
        && candidate.axis === axis
        && candidate.mode === mode)
      if (branch !== undefined)
        selected = branch.definition
    }
    if (selected !== undefined && selected.kind !== 'none')
      substitutions.set(node.key, selected)
  }
  return substitutions
}

function resolveForState(graph: TokenGraph, when: AxisSelection): Map<string, string> {
  const resolved = resolveGraph(
    { ...graph, results: new Map() },
    selectAxisBranches(graph, when),
  )
  if (resolved.diagnostics.length > 0)
    throw new Error(resolved.diagnostics.map(diagnostic => diagnostic.message).join('\n'))
  return new Map([...graph.nodes.values()].flatMap((node) => {
    const value = resolved.results.get(node.key)?.emitted
    return value === undefined || !node.contract.emit ? [] : [[node.name, value] as const]
  }))
}

function layerOrder(graph: TokenGraph, layer: string): number {
  if (graph.phaseLayers === undefined)
    return 0
  if (layer === graph.phaseLayers.base)
    return 0
  const axis = graph.axes?.order.find(axisName => graph.phaseLayers!.axes[axisName] === layer)
  if (axis !== undefined)
    return graph.axes!.order.indexOf(axis) + 1
  if (layer === graph.phaseLayers.cases)
    return (graph.axes?.order.length ?? 0) + 1
  return -1
}

function readTokenDeclarations(css: string, graph: TokenGraph): readonly EmittedDeclaration[] {
  const declarations: EmittedDeclaration[] = []
  let sourceOrder = 0

  const visit = (
    nodes: readonly VanityFlatNode[],
    context: { readonly layer: string, readonly media: readonly string[] },
  ): void => {
    for (const node of nodes) {
      if (node.kind === 'at') {
        const prelude = node.prelude.trim()
        if (prelude.startsWith('@layer ')) {
          visit(node.children, { layer: prelude.slice('@layer '.length).trim(), media: context.media })
        }
        else if (prelude.startsWith('@media ')) {
          visit(node.children, {
            layer: context.layer,
            media: [...context.media, prelude.slice('@media '.length).trim()],
          })
        }
        else {
          visit(node.children, context)
        }
        continue
      }

      for (const [property, value] of node.declarations) {
        if (property.startsWith('--')) {
          declarations.push({
            layer: context.layer,
            layerOrder: layerOrder(graph, context.layer),
            selector: node.selector,
            media: context.media,
            property,
            value,
            specificity: selectorSpecificity(node.selector),
            sourceOrder,
          })
        }
        sourceOrder++
      }
    }
  }

  visit(parseBlocks(css), { layer: graph.phaseLayers?.root ?? '', media: [] })
  return declarations
}

function winningValues(
  declarations: readonly EmittedDeclaration[],
  state: SelectorState,
): Map<string, string> {
  const winners = new Map<string, EmittedDeclaration>()
  for (const declaration of declarations) {
    if (!declaration.media.every(query => mediaMatches(query, state)))
      continue
    if (!matchesSelector(declaration.selector, state.axes))
      continue

    const previous = winners.get(declaration.property)
    if (previous === undefined || compareCascade(previous, declaration) < 0)
      winners.set(declaration.property, declaration)
  }
  return new Map([...winners].map(([property, declaration]) => [property, declaration.value]))
}

function compareCascade(left: EmittedDeclaration, right: EmittedDeclaration): number {
  if (left.layerOrder !== right.layerOrder)
    return left.layerOrder - right.layerOrder
  for (let index = 0; index < 3; index++) {
    if (left.specificity[index] !== right.specificity[index])
      return left.specificity[index]! - right.specificity[index]!
  }
  return left.sourceOrder - right.sourceOrder
}

function mediaMatches(query: string, state: SelectorState): boolean {
  if (query.includes('prefers-color-scheme: dark'))
    return Object.values(state.axes).includes('dark')
  if (query.includes('prefers-color-scheme: light'))
    return !Object.values(state.axes).includes('dark')
  // The generated property fixtures use an always-true media query. Other
  // query forms remain active in this CSS-only model; their selector still
  // participates in the carrier assertion.
  return true
}

function splitTopLevel(input: string, separator = ','): string[] {
  const parts: string[] = []
  let start = 0
  let parentheses = 0
  let brackets = 0
  let quote: string | undefined

  for (let index = 0; index < input.length; index++) {
    const character = input[index]!
    if (quote !== undefined) {
      if (character === quote && input[index - 1] !== '\\')
        quote = undefined
      continue
    }
    if (character === '"' || character === '\'') {
      quote = character
      continue
    }
    if (character === '(') {
      parentheses++
    }
    else if (character === ')') {
      parentheses--
    }
    else if (character === '[') {
      brackets++
    }
    else if (character === ']') {
      brackets--
    }
    else if (character === separator && parentheses === 0 && brackets === 0) {
      parts.push(input.slice(start, index).trim())
      start = index + 1
    }
  }

  parts.push(input.slice(start).trim())
  return parts.filter(Boolean)
}

function matchingDelimiter(input: string, start: number, opening: string, closing: string): number {
  let depth = 0
  let quote: string | undefined
  for (let index = start; index < input.length; index++) {
    const character = input[index]!
    if (quote !== undefined) {
      if (character === quote && input[index - 1] !== '\\')
        quote = undefined
      continue
    }
    if (character === '"' || character === '\'') {
      quote = character
      continue
    }
    if (character === opening)
      depth++
    else if (character === closing && --depth === 0)
      return index
  }
  return input.length - 1
}

function matchesSelector(selector: string, axes: AxisSelection): boolean {
  return splitTopLevel(selector).some(part => matchesCompound(part, axes))
}

function matchesCompound(selector: string, axes: AxisSelection): boolean {
  let matches = true
  for (let index = 0; index < selector.length;) {
    const character = selector[index]!
    if (/[\s>+~]/.test(character)) {
      index++
      continue
    }
    if (character === '&' || character === '*') {
      index++
      continue
    }
    if (character === '[') {
      const end = matchingDelimiter(selector, index, '[', ']')
      matches &&= matchesAttribute(selector.slice(index + 1, end), axes)
      index = end + 1
      continue
    }
    if (character === ':') {
      const pseudoStart = index + (selector[index + 1] === ':' ? 2 : 1)
      let end = pseudoStart
      while (end < selector.length && /[\w-]/.test(selector[end]!))
        end++
      const name = selector.slice(pseudoStart, end)
      if (selector[end] === '(') {
        const close = matchingDelimiter(selector, end, '(', ')')
        const contents = selector.slice(end + 1, close)
        const alternatives = splitTopLevel(contents)
        const childMatches = alternatives.some(alternative => matchesCompound(alternative, axes))
        if (name === 'not')
          matches &&= !childMatches
        else if (name === 'is' || name === 'where' || name === 'has')
          matches &&= childMatches
        index = close + 1
      }
      else {
        // :root and the generated pseudo-classes are rooted by construction.
        index = end
      }
      continue
    }
    if (character === '#' || character === '.') {
      while (index < selector.length && /[\w.#-]/.test(selector[index]!))
        index++
      continue
    }
    index++
  }
  return matches
}

function matchesAttribute(attribute: string, axes: AxisSelection): boolean {
  const match = attribute.match(/^\s*([^\s~|^$*=[\]]+)\s*(?:[~|^$*]?=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/)
  if (match === null)
    return true
  const name = match[1]!
  const expected = match[2] ?? match[3] ?? match[4]
  const axis = name.startsWith('data-') ? name.slice('data-'.length) : undefined
  const actual = axis === undefined ? undefined : axes[axis]
  return expected === undefined ? actual !== undefined : actual === expected
}

function selectorSpecificity(selector: string): Specificity {
  const alternatives = splitTopLevel(selector)
  if (alternatives.length > 1)
    return alternatives.reduce<Specificity>((maximum, alternative) => maxSpecificity(maximum, selectorSpecificity(alternative)), [0, 0, 0])

  let specificity: [number, number, number] = [0, 0, 0]
  for (let index = 0; index < selector.length;) {
    const character = selector[index]!
    if (character === '#') {
      specificity[0]++
      index = consumeIdentifier(selector, index + 1)
      continue
    }
    if (character === '.') {
      specificity[1]++
      index = consumeIdentifier(selector, index + 1)
      continue
    }
    if (character === '[') {
      specificity[1]++
      index = matchingDelimiter(selector, index, '[', ']') + 1
      continue
    }
    if (character === ':') {
      const double = selector[index + 1] === ':'
      const nameStart = index + (double ? 2 : 1)
      let nameEnd = nameStart
      while (nameEnd < selector.length && /[\w-]/.test(selector[nameEnd]!))
        nameEnd++
      const name = selector.slice(nameStart, nameEnd)
      if (selector[nameEnd] === '(') {
        const close = matchingDelimiter(selector, nameEnd, '(', ')')
        if (name !== 'where') {
          const nested = selectorSpecificity(selector.slice(nameEnd + 1, close))
          specificity = addSpecificity(specificity, nested)
        }
        index = close + 1
      }
      else {
        specificity[double ? 2 : 1]++
        index = nameEnd
      }
      continue
    }
    index++
  }
  return specificity
}

function consumeIdentifier(input: string, start: number): number {
  let index = start
  while (index < input.length && /[\w-]/.test(input[index]!))
    index++
  return index
}

function addSpecificity(left: Specificity, right: Specificity): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
}

function maxSpecificity(left: Specificity, right: Specificity): Specificity {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index])
      return left[index]! > right[index]! ? left : right
  }
  return left
}

function buildG10Fixture(): BuiltSystem {
  return asBuiltSystem(emit(() => inSystemScope(() => {
    const open = createSystem()
      .addAxis('scheme', colorSchemes())
      .addAxis('density', {
        modes: { cozy: '&', compact: data('density', 'compact') },
        default: 'cozy',
      })
    const module = open.defineTokens({
      base: open.tdef.color({
        axes: {
          scheme: { light: '#ffffff', dark: '#000000' },
          density: { cozy: '#ffffff', compact: '#101010' },
        },
      }),
    }).add(m => ({ onBase: open.legibleOn(m.base) }))
    return emitSystem(open.addTokens(module).consolidate({ prefix: 'property-g10' }))
  })))
}

function buildG11Fixture(): BuiltSystem {
  return asBuiltSystem(emit(() => inSystemScope(() => {
    const open = createSystem()
      .addAxis('scheme', colorSchemes())
      .addAxis('density', {
        modes: {
          cozy: data('density', 'cozy'),
          compact: data('density', 'compact'),
        },
        default: 'cozy',
      })
    const module = open.defineTokens({
      tint: open.tdef.color({
        val: '#000000',
        axes: { density: { cozy: '#000000', compact: '#ffffff' } },
      }),
    }).add(m => ({
      pick: open.tdef.color({
        val: open.legibleOn(m.tint),
        axes: { scheme: { dark: color('red') } },
      }),
    }))
    return emitSystem(open.addTokens(module).consolidate({ prefix: 'property-g11' }))
  })))
}

function buildAuthoredFallbackCaseFixture(): BuiltSystem {
  return asBuiltSystem(emit(() => inSystemScope(() => {
    const open = createSystem()
      .addAxis('scheme', colorSchemes())
      .addAxis('density', {
        modes: { cozy: '&', compact: data('density', 'compact') },
        default: 'cozy',
      })
    const module = open.defineTokens({
      base: open.tdef.color({
        axes: {
          scheme: { light: '#ffffff', dark: '#000000' },
          density: { cozy: '#ffffff', compact: '#101010' },
        },
      }),
    }).add(m => ({
      onBase: open.tdef.color({
        val: open.legibleOn(m.base),
        cases: [{ when: { scheme: 'dark', density: 'cozy' }, val: 'purple' }],
      }),
    }))
    return emitSystem(open.addTokens(module).consolidate({ prefix: 'property-authored' }))
  })))
}

function axisInputs(
  axis: string,
  modes: readonly string[],
  shape: ArmShape,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {}
  if (shape === 'fallback') {
    inputs[modes[0]!] = '&'
    for (const mode of modes.slice(1))
      inputs[mode] = data(axis, mode)
    return inputs
  }

  if (shape === 'explicit') {
    for (const mode of modes)
      inputs[mode] = data(axis, mode)
    return inputs
  }

  const query = media('(min-width: 0px)')
  const exclusions = modes.slice(1)
    .map(mode => `:not([data-${axis}='${mode}'])`)
    .join('')
  inputs[modes[0]!] = query.and(selector(`&${exclusions}`))
  for (const mode of modes.slice(1))
    inputs[mode] = query.and(selector(`&[data-${axis}='${mode}']`))
  return inputs
}

function axisBranches(
  axes: readonly string[],
  modesByAxis: Readonly<Record<string, readonly string[]>>,
  offset: number,
): Record<string, Record<string, number>> | undefined {
  if (axes.length === 0)
    return undefined
  return Object.fromEntries(axes.map((axis, axisIndex) => [
    axis,
    Object.fromEntries(modesByAxis[axis]!.map((mode, modeIndex) => [
      mode,
      offset + (axisIndex + 1) * 10 + modeIndex + 0.5,
    ])),
  ]))
}

function colorAxisBranches(
  axes: readonly string[],
  modesByAxis: Readonly<Record<string, readonly string[]>>,
  axisOffset: number,
): Record<string, Record<string, string>> | undefined {
  if (axes.length === 0)
    return undefined
  const values = ['#ffffff', '#101010', '#f0f0f0', '#202020', '#d0d0d0', '#303030']
  return Object.fromEntries(axes.map((axis, axisIndex) => [
    axis,
    Object.fromEntries(modesByAxis[axis]!.map((mode, modeIndex) => [
      mode,
      values[(axisOffset + axisIndex * 2 + modeIndex) % values.length]!,
    ])),
  ]))
}

function buildGeneratedFixture(
  axisCount: 1 | 2 | 3,
  modesPerAxis: 2 | 3,
  armShapes: ArmShapeAssignment,
  dependentShape: DependentShape,
): BuiltSystem {
  return asBuiltSystem(emit(() => inSystemScope(() => {
    let open: any = createSystem()
    const axisNames = Array.from({ length: axisCount }, (_, index) => `axis${index}`)
    const modesByAxis: Record<string, readonly string[]> = {}
    for (const [axisIndex, axis] of axisNames.entries()) {
      const modes = Array.from({ length: modesPerAxis }, (_, modeIndex) => `mode${modeIndex}`)
      modesByAxis[axis] = modes
      open = open.addAxis(axis, {
        modes: axisInputs(axis, modes, armShapes[axisIndex]!),
        default: modes[0],
      })
    }

    const dependencyAxes = dependentShape === 'own'
      ? []
      : dependentShape === 'both'
        ? axisNames.length > 1 ? axisNames.slice(1) : axisNames.slice(0, 1)
        : axisNames
    const ownAxes = dependentShape === 'own'
      ? axisNames
      : dependentShape === 'both'
        ? axisNames.slice(0, 1)
        : []
    const sourceNames = dependencyAxes.length === 0
      ? ['source0']
      : dependencyAxes.map((_, index) => `source${index}`)
    const sourceEntries = Object.fromEntries(sourceNames.map((name, index) => {
      const axis = dependencyAxes[index]
      const axes = axis === undefined ? undefined : axisBranches([axis], modesByAxis, 1 + index * 100)
      return [name, open.tdef({
        val: 1.5,
        ...(axes === undefined ? {} : { axes }),
        emit: true,
      })]
    }))
    let module = open.defineTokens(sourceEntries)

    if (dependentShape === 'chained') {
      module = module.add((m: any) => ({
        middle: open.tdef({
          val: sumHandles(open, sourceNames.map(name => m[name])),
          ...(axisBranches(
            axisNames.length > 1 ? axisNames.slice(1) : axisNames,
            modesByAxis,
            20,
          ) === undefined
            ? {}
            : {
                axes: axisBranches(
                  axisNames.length > 1 ? axisNames.slice(1) : axisNames,
                  modesByAxis,
                  20,
                ),
              }),
          emit: true,
        }),
      }))
      module = module.add((m: any) => ({
        dependent: open.tdef({
          val: open.calc(m.middle).multiply(2),
          emit: true,
        }),
      }))
    }
    else {
      module = module.add((m: any) => ({
        dependent: open.tdef({
          val: sumHandles(open, sourceNames.map(name => m[name])),
          ...(axisBranches(ownAxes, modesByAxis, 40) === undefined ? {} : { axes: axisBranches(ownAxes, modesByAxis, 40) }),
          reference: dependentShape === 'live' || ownAxes.length > 0 ? 'var' : 'val',
          emit: true,
        }),
      }))
    }

    const prefix = `property-${axisCount}-${modesPerAxis}-${armShapes.join('-')}-${dependentShape}`
    return emitSystem(open.addTokens(module).consolidate({ prefix }))
  })))
}

function sumHandles(open: any, handles: readonly unknown[]): unknown {
  const [first, ...rest] = handles
  if (first === undefined)
    throw new Error('generated fixture needs at least one source handle')
  let value = open.calc(first)
  for (const handle of rest)
    value = value.add(handle)
  return value
}

function mixHandles(open: any, handles: readonly unknown[]): unknown {
  if (handles.length === 1)
    return handles[0]
  return open.colorMix(handles).in('oklab')
}

const GENERATED_ARM_SHAPES: readonly ArmShape[] = ['explicit', 'fallback', 'media']
const GENERATED_DEPENDENT_SHAPES: readonly DependentShape[] = ['own', 'dependency', 'both', 'chained', 'live']

function armShapeAssignments(axisCount: 1 | 2 | 3): readonly ArmShapeAssignment[] {
  let assignments: ArmShapeAssignment[] = [[]]
  for (let index = 0; index < axisCount; index++) {
    assignments = assignments.flatMap(existing => GENERATED_ARM_SHAPES.map(shape => [...existing, shape]))
  }
  return assignments
}

function generatedFixtures(): readonly [1 | 2 | 3, 2 | 3, ArmShapeAssignment, DependentShape][] {
  const fixtures: [1 | 2 | 3, 2 | 3, ArmShapeAssignment, DependentShape][] = []
  for (const axisCount of [1, 2, 3] as const) {
    for (const modesPerAxis of [2, 3] as const) {
      for (const armShapes of armShapeAssignments(axisCount)) {
        for (const dependentShape of GENERATED_DEPENDENT_SHAPES)
          fixtures.push([axisCount, modesPerAxis, armShapes, dependentShape])
      }
    }
  }
  return fixtures
}

function buildVariationFixture(
  axisCount: 1 | 2 | 3,
  modesPerAxis: 2 | 3,
  armShapes: ArmShapeAssignment,
  ownAxisCount: 0 | 1 | 2,
  dependencyAxisCount: 0 | 1 | 2,
): { readonly fixture: BuiltSystem, readonly contributingAxes: readonly string[] } {
  return (() => {
    const axisNames = Array.from({ length: axisCount }, (_, index) => `axis${index}`)
    const ownAxes = axisNames.slice(0, Math.min(ownAxisCount, axisNames.length))
    const dependencyAxes = ownAxisCount === 1 && dependencyAxisCount === 1 && axisNames.length > 1
      ? [axisNames[1]!]
      : axisNames.slice(0, Math.min(dependencyAxisCount, axisNames.length))
    const contributingAxes = axisNames.filter(axis => ownAxes.includes(axis) || dependencyAxes.includes(axis))
    const fixture = asBuiltSystem(emit(() => inSystemScope(() => {
      let open: any = createSystem()
      const modesByAxis: Record<string, readonly string[]> = {}
      for (const [axisIndex, axis] of axisNames.entries()) {
        const modes = Array.from({ length: modesPerAxis }, (_, modeIndex) => `mode${modeIndex}`)
        modesByAxis[axis] = modes
        open = open.addAxis(axis, {
          modes: axisInputs(axis, modes, armShapes[axisIndex]!),
          default: modes[0],
        })
      }

      const sourceNames = dependencyAxes.length === 0
        ? ['source0']
        : dependencyAxes.map((_, index) => `source${index}`)
      const sourceEntries = Object.fromEntries(sourceNames.map((name, index) => {
        const axis = dependencyAxes[index]
        const axes = axis === undefined ? undefined : colorAxisBranches([axis], modesByAxis, index * 2)
        return [name, open.tdef.color({
          val: 'white',
          ...(axes === undefined ? {} : { axes }),
          ...(axis === undefined ? { reference: 'val' } : {}),
          emit: true,
        })]
      }))
      let module = open.defineTokens(sourceEntries)
      module = module.add((m: any) => ({
        dependent: open.tdef.color({
          val: open.legibleOn(mixHandles(open, sourceNames.map(name => m[name]))),
          ...(colorAxisBranches(ownAxes, modesByAxis, 0) === undefined ? {} : { axes: colorAxisBranches(ownAxes, modesByAxis, 0) }),
          reference: ownAxes.length > 0 ? 'var' : 'val',
          emit: true,
        }),
      }))
      const prefix = `property-variation-${axisCount}-${modesPerAxis}-${armShapes.join('-')}-${ownAxisCount}-${dependencyAxisCount}`
      return emitSystem(open.addTokens(module).consolidate({ prefix }))
    })))
    return { fixture, contributingAxes }
  })()
}

function assertCascadeMatchesResolution(fixture: BuiltSystem): void {
  const declarations = readTokenDeclarations(fixture.css, fixture.graph)
  for (const when of axisModeProduct(fixture.graph)) {
    const actual = winningValues(declarations, { axes: when })
    const expected = resolveForState(fixture.graph, when)
    for (const [property, value] of expected)
      expect(actual.get(property), `${property} @ ${JSON.stringify(when)}`).toBe(value)
  }
}

function assertDerivedCaseSelectorsExact(fixture: BuiltSystem): void {
  const casesLayer = fixture.graph.phaseLayers?.cases
  const declarations = readTokenDeclarations(fixture.css, fixture.graph)
    .filter(declaration => declaration.layer === casesLayer)
  const semanticCases = new Map<string, {
    readonly when: AxisSelection
    readonly selector: string
    readonly media: readonly string[]
    readonly value: string
  }[]>()

  for (const token of Object.values(fixture.semantic.tokens)) {
    if (token.name === undefined)
      continue
    const cases = token.declarations
      .filter(declaration => declaration.kind === 'case' && declaration.when !== undefined)
      .flatMap(declaration => declaration.context.selectors.map(selector => ({
        when: declaration.when!,
        selector,
        media: declaration.context.atRules
          .filter(atRule => atRule.startsWith('@media '))
          .map(atRule => atRule.slice('@media '.length)),
        value: String(declaration.val),
      })))
    if (cases.length > 0)
      semanticCases.set(token.name, cases)
  }

  for (const declaration of declarations) {
    const cases = semanticCases.get(declaration.property)
    const semanticCase = cases?.find(candidate => candidate.selector === declaration.selector
      && candidate.value === declaration.value
      && candidate.media.length === declaration.media.length
      && candidate.media.every((query, index) => query === declaration.media[index]))
    if (semanticCase === undefined)
      continue

    for (const when of axisModeProduct(fixture.graph)) {
      const isAddressed = Object.entries(semanticCase.when)
        .every(([axis, mode]) => when[axis] === mode)
      const isActive = declaration.media.every(query => mediaMatches(query, { axes: when }))
      expect(
        matchesSelector(declaration.selector, when) && isActive,
        `${declaration.selector}${declaration.media.join(' ')} @ ${JSON.stringify(when)}`,
      ).toBe(isAddressed)
    }
  }
}

describe('axis-composition property evidence', () => {
  it('reproduces G-10 through the emitted CSS carrier', () => {
    const fixture = buildG10Fixture()
    expect(fixture.semantic.tokens.onBase?.axisCoverage?.contributingAxes).toEqual(['scheme', 'density'])
    expect(() => assertCascadeMatchesResolution(fixture)).not.toThrow()
  })

  it('reproduces G-11 through the emitted CSS carrier', () => {
    const fixture = buildG11Fixture()
    expect(fixture.semantic.tokens.pick?.axisCoverage?.contributingAxes).toEqual(['scheme', 'density'])
    expect(() => assertCascadeMatchesResolution(fixture)).not.toThrow()
  })

  it('keeps each derived case selector inside its semantic address', () => {
    const fixture = buildG10Fixture()
    assertDerivedCaseSelectorsExact(fixture)
  })

  it('leaves authored fallback cases on their existing carrier path', () => {
    const fixture = buildAuthoredFallbackCaseFixture()
    const cases = fixture.semantic.tokens.onBase?.declarations
      .filter(declaration => declaration.kind === 'case') ?? []
    expect(cases).not.toHaveLength(0)
    expect(cases.every(declaration => declaration.context.selectors
      .every(selector => !selector.includes('data-density=\'compact\'')))).toBe(true)
    expect(fixture.css).toContain('--property-authored-on-base: purple;')
  })

  it('assigns carrier arm shapes independently to each axis', () => {
    expect(armShapeAssignments(1)).toHaveLength(3)
    expect(armShapeAssignments(2)).toHaveLength(9)
    expect(armShapeAssignments(3)).toHaveLength(27)
    expect(armShapeAssignments(2)).toContainEqual(['fallback', 'explicit'])
    expect(armShapeAssignments(2)).toContainEqual(['media', 'fallback'])
  })

  it('covers the generated axis, arm, and dependent-shape product', () => {
    for (const [axisCount, modesPerAxis, armShapes, dependentShape] of generatedFixtures()) {
      const fixture = buildGeneratedFixture(axisCount, modesPerAxis, armShapes, dependentShape)
      assertDerivedCaseSelectorsExact(fixture)
      assertCascadeMatchesResolution(fixture)
    }
  })

  it('covers the closed source-of-variation union, including same-axis overlap', () => {
    for (const axisCount of [1, 2, 3] as const) {
      for (const modesPerAxis of [2, 3] as const) {
        for (const armShapes of armShapeAssignments(axisCount)) {
          for (const ownAxisCount of [0, 1, 2] as const) {
            for (const dependencyAxisCount of [0, 1, 2] as const) {
              const { fixture, contributingAxes } = buildVariationFixture(
                axisCount,
                modesPerAxis,
                armShapes,
                ownAxisCount,
                dependencyAxisCount,
              )
              const coverage = fixture.semantic.tokens.dependent?.axisCoverage
              if (contributingAxes.length >= 2) {
                const label = JSON.stringify({ axisCount, modesPerAxis, armShapes, ownAxisCount, dependencyAxisCount })
                expect(coverage?.contributingAxes, label).toEqual(contributingAxes)
              }
              else {
                expect(coverage).toBeUndefined()
              }
              assertDerivedCaseSelectorsExact(fixture)
              assertCascadeMatchesResolution(fixture)
            }
          }
        }
      }
    }

    const sameAxis = buildVariationFixture(1, 2, ['fallback'], 1, 1).fixture
    expect(sameAxis.semantic.tokens.dependent?.axisCoverage).toBeUndefined()
    expect(readTokenDeclarations(sameAxis.css, sameAxis.graph)
      .filter(declaration => declaration.layer === sameAxis.graph.phaseLayers?.cases
        && declaration.property.endsWith('-dependent'))).toHaveLength(0)
  })
})
