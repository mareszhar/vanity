/** Contrast evidence over reachable writes, using the runtime's acceptance path. */
import type { VanityDiagnosticInput } from '../diagnostics'
import type { VanityContrastRecord } from '../introspect/records'
import type { VanityRuntimeTokenContract } from '../runtime/contract'
import type { TextContrastCheck } from './checks'
import type { VanityColorExpr } from './color'
import type { TokenGraph, VanityLeafDefinition } from './module'
import { resolveRuntimeValue } from '../runtime/acceptance'
import { VanityRuntimeError } from '../runtime/contract'
import { getTokenRangeError } from '../runtime/range'
import { getNode as valueNode } from '../values/protocol'
import { convertToExpression } from './color'
import { getTokenEnvironments } from './environments'
import { collectRefs, foldExpr } from './expressions'
import { formatOklch, measureApcaContrast, measureWcagContrast } from './math'
import { getNode, getTokenContextSubstitutions } from './module'
import { createTokenCheckResolver } from './resolve'

interface Grid {
  token: VanityRuntimeTokenContract
  count: number
  step: string
  getInput: (index: number, count: number) => string | number
}

export function validateTokenCheckSamples(entry: TextContrastCheck, graph: TokenGraph): { records: VanityContrastRecord[], diagnostics: VanityDiagnosticInput[] } | undefined {
  const text = convertToExpression(entry.text)
  const background = convertToExpression(entry.background)
  const dependencies = new Set<string>()
  function visitDefinition(definition: VanityLeafDefinition) {
    if (definition.kind === 'color') {
      visitExpression(definition.expr)
    }
    else if (definition.kind === 'value') {
      valueNode(definition.value).dependencies.forEach((ref) => {
        if (ref.path)
          visit(ref.path)
      })
    }
    // A contrast definition is the pick compiled into CSS, not a live choice.
  }
  function visitExpression(expression: VanityColorExpr) {
    if (expression.kind === 'contrast')
      return
    const paths = new Set<string>()
    collectRefs(expression, paths)
    paths.forEach(visit)
  }
  function visit(path: string) {
    if (dependencies.has(path))
      return
    dependencies.add(path)
    const node = graph.nodes.get(path)
    if (!node)
      return
    visitDefinition(node.definition)
    node.branches.forEach(branch => visitDefinition(branch.definition))
  }
  visitExpression(text)
  visitExpression(background)
  const mutable = graph.runtime?.tokens.filter(token => token.mutable && dependencies.has(token.token.join('.'))) ?? []
  if (!mutable.length)
    return
  const grids = mutable.filter(token => token.range).map(createGrid)
  const missing = mutable.filter(token => !token.range).map(token => token.token.join('.'))
  const fullProduct = grids.reduce((product, grid) => product * grid.count, 1)
  const counts = grids.map(grid => Math.min(grid.count, 1025))
  while (counts.reduce((product, count) => product * count, 1) > 1024) {
    const biggest = Math.max(...counts)
    const index = counts.indexOf(biggest)
    counts[index] = Math.max(1, Math.floor(biggest / 2))
  }
  const combinations: (string | number)[][] = []
  const collectCombinations = (values: (string | number)[], index: number) => {
    if (index === grids.length) {
      combinations.push(values)
      return
    }
    for (let i = 0; i < counts[index]!; i++) collectCombinations([...values, grids[index]!.getInput(i, counts[index]!)], index + 1)
  }
  if (grids.length)
    collectCombinations([], 0)
  const profiles = mutable.some(token => token.validation?.runtime === 'dev') ? ['development', 'production'] as const : ['both'] as const
  const records: VanityContrastRecord[] = []
  const diagnostics: VanityDiagnosticInput[] = []
  const pairing = `${describe(text)} on ${describe(background)}`
  const note = missing.length ? `declare a range for ${missing.join(', ')}; these inputs stay at authored values` : undefined
  let currentEnvironment: Map<string, VanityLeafDefinition> | undefined
  let environmentName = ''
  const measure = (scheme: 'light' | 'dark', overrides?: Map<string, VanityLeafDefinition>) => {
    const resolver = createTokenCheckResolver(graph, scheme, overrides, currentEnvironment)
    const foreground = foldExpr(text, scheme, resolver)
    const backdrop = foldExpr(background, scheme, resolver)
    const measured = entry.level.algorithm === 'apca' ? Math.abs(measureApcaContrast(foreground, backdrop)) : measureWcagContrast(foreground, backdrop)
    return { measured, detail: `${formatOklch(foreground)} on ${formatOklch(backdrop)}` }
  }
  for (const { scheme, when } of getTokenEnvironments(graph, [...dependencies])) {
    currentEnvironment = getTokenContextSubstitutions(graph, when)
    environmentName = Object.entries(when).map(([axis, mode]) => `${axis}=${mode}`).join(', ')
    const recordsStart = records.length
    const diagnosticsStart = diagnostics.length
    const traces: string[] = []
    const authored = measure(scheme)
    if (authored.measured < entry.level.min)
      fail(authored, scheme, 'checked: authored values')
    for (const profile of profiles) {
      let worst = authored
      let worstValues: Record<string, string | number> = {}
      let samples = 0
      let limited = false
      const states: unknown[] = []
      for (const values of combinations) {
        const overrides = new Map<string, VanityLeafDefinition>()
        const acceptedValues: Record<string, string | number> = {}
        let reachable = true
        for (const [i, grid] of grids.entries()) {
          const path = grid.token.token.join('.')
          try {
            const accepted = resolveRuntimeValue(grid.token, values[i], graph.runtimeSchemas ?? {}, { dev: profile !== 'production' && profile !== 'both' }, getTokenRangeError)
            if (!accepted) {
              reachable = false
              break
            }
            overrides.set(path, { kind: 'literal', value: accepted.value })
            acceptedValues[path] = grid.token.type === 'number' || grid.token.type === 'integer' ? Number(accepted.value) : accepted.value
          }
          catch (error) {
            if (!(error instanceof VanityRuntimeError))
              throw error
            if (error.diagnostic.code === 'VANITY_RUNTIME_SCHEMA_MISMATCH')
              limited = true
            reachable = false
            break
          }
        }
        if (!reachable) {
          states.push(null)
          continue
        }
        states.push(acceptedValues)
        const measured = measure(scheme, overrides)
        if (samples === 0 || measured.measured < worst.measured) {
          worst = measured
          worstValues = acceptedValues
        }
        samples++
      }
      const parameters = {
        declaredRange: Object.fromEntries(grids.map(grid => [grid.token.token.join('.'), grid.token.range])),
        ...(fullProduct > 1024 ? { reduced: true, fullProduct: Number.isFinite(fullProduct) ? fullProduct : 'more than Number.MAX_VALUE', grid: Object.fromEntries(grids.map((grid, i) => [grid.token.token.join('.'), counts[i]])) } : {}),
        ...(limited ? { limit: 'validator not evaluated' } : {}),
        ...(note ? { note } : {}),
      }
      const entryRecord: VanityContrastRecord = {
        kind: 'contrast',
        file: graph.file,
        pairing,
        scheme,
        algorithm: entry.level.algorithm,
        min: entry.level.min,
        accepted: false,
        tokens: [...dependencies].sort(),
        ...(Object.keys(when).length ? { environment: when } : {}),
        measured: Math.round(worst.measured * 10) / 10,
        evidence: grids.length ? { level: 'sampled', samples, parameters } : { level: 'environments', environments: Object.keys(when).length ? [[...Object.entries(when).map(([axis, mode]) => `${axis}=${mode}`), `scheme=${scheme}`].filter((value, index, values) => values.indexOf(value) === index).join(',')] : ['light', 'dark'] },
        ...(grids.length ? { samples, step: Object.fromEntries(grids.map((grid, i) => [grid.token.token.join('.'), counts[i] === grid.count ? grid.step : `${counts[i]} evenly spaced values (reduced)`])), worst: worstValues, profile } : {}),
        ...(note ? { note } : {}),
      }
      records.push(entryRecord)
      traces.push(JSON.stringify({ states, limited }))
      if (samples && worst.measured < entry.level.min)
        fail(worst, scheme, `sampled${profile === 'both' ? '' : ` (${profile})`}: ${JSON.stringify(worstValues)}`)
    }
    if (profiles.length === 2 && traces[0] === traces[1]) {
      records.splice(recordsStart, 2, { ...records[recordsStart]!, profile: 'both' })
      const failures = diagnostics.splice(diagnosticsStart).map(diagnostic => ({ ...diagnostic, message: diagnostic.message.replace(/sampled \((development|production)\)/, 'sampled') }))
      diagnostics.push(...new Map(failures.map(diagnostic => [diagnostic.message, diagnostic])).values())
    }
  }
  return { records, diagnostics }

  function fail(measured: { measured: number, detail: string }, scheme: string, evidence: string) {
    diagnostics.push({ code: 'VANITY_TOKENS_CONTRAST', file: graph.file, message: `${describe(text)} / ${describe(background)} fails ${entry.level.algorithm === 'apca' ? `APCA Lc ${entry.level.min}` : `WCAG 2 ${entry.level.min}:1`} in scheme "${scheme}" (${evidence})${environmentName ? ` (${environmentName})` : ''}`, detail: [`${measured.detail} = ${entry.level.algorithm === 'apca' ? `Lc ${measured.measured.toFixed(1)}` : `${measured.measured.toFixed(2)}:1`}`], fix: 'adjust the pairing for the declared range and validation, or relax the check level deliberately' })
  }
}

function describe(expression: VanityColorExpr): string {
  return expression.kind === 'ref' ? getNode(expression.handle)?.key ?? 'its target' : 'its target'
}

function createGrid(token: VanityRuntimeTokenContract): Grid {
  const parse = (source: string) => {
    const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i.exec(source.trim())!
    return { value: Number(match[1]), unit: match[2]! }
  }
  const min = parse(token.range![0])
  const max = parse(token.range![1])
  const factors: Record<string, number> = token.type === 'angle' ? { deg: 1, grad: 0.9, turn: 360, rad: 180 / Math.PI } : token.type === 'time' ? { ms: 1, s: 1000 } : token.type === 'length' ? { px: 1, cm: 4800 / 127, mm: 480 / 127, Q: 120 / 127, in: 96, pt: 4 / 3, pc: 16 } : {}
  const a = min.value * (factors[min.unit] ?? 1)
  const b = max.value * (factors[max.unit] ?? 1)
  const count = token.type === 'integer' ? Math.min(33, b - a + 1) : token.type === 'angle' ? Math.ceil((b - a) / 5) + 1 : a === b ? 1 : 33
  return {
    token,
    count,
    step: token.type === 'angle' ? '5°' : token.type === 'integer' && b - a < 33 ? '1' : `${count} evenly spaced values`,
    getInput(index, points) {
      if (index === 0)
        return min.unit ? token.range![0] : min.value
      if (index === points - 1)
        return max.unit ? token.range![1] : max.value
      const fraction = index / (points - 1)
      const value = token.type === 'angle' && points === count ? Math.min(b, a + index * 5) : a * (1 - fraction) + b * fraction
      const rounded = token.type === 'integer' ? Math.round(value) : value
      return min.unit ? `${rounded / (factors[min.unit] ?? 1)}${min.unit}` : rounded
    },
  }
}
