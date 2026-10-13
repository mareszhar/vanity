import { generate, parse } from 'css-tree'
import { getGrammarTypes, getLexer, grammar, inspectDeclaration } from './model.mjs'

const REPRESENTATIVES = { color: 'red', length: '1px', percentage: '1%', number: '1.5', integer: '1', time: '1s', angle: '1deg' }

/** Observe the grammar position of one interpolation hole, not equal values. */
export function attributeHole(property, value, index) {
  const ast = parse(value, { context: 'value', positions: true })
  const node = ast.children.toArray()[index]
  const accepted = []
  for (const [kind, replacement] of Object.entries(REPRESENTATIVES)) {
    const source = value.slice(0, node.loc.start.offset) + replacement + value.slice(node.loc.end.offset)
    const candidate = parse(source, { context: 'value' })
    const match = getLexer(property).matchProperty(property, candidate)
    if (!match.matched)
      continue
    const trace = match.getTrace(candidate.children.toArray()[index])
    let component = property
    // The nearest named grammar position wins. A recursive union would also
    // find lengths inside color functions and confuse border width with color.
    for (const entry of trace) {
      if (entry.type !== 'Type')
        continue
      const candidates = grammar.properties[property].longhands.filter(name => getGrammarTypes(name).includes(`Type:${entry.name}`))
      if (candidates.length === 1) {
        component = candidates[0]
        break
      }
    }
    accepted.push({ kind, trace, component })
  }
  return { source: generate(node), accepted }
}

export function observeAttribution() {
  const width = attributeHole('border', 'var(--stroke) solid var(--edge)', 0)
  // For one hole, the other inputs are resolved in one environment first.
  const color = attributeHole('border', '1px solid var(--edge)', 2)
  const wrong = attributeHole('border', '1px solid 8px', 2)
  const records = [
    { property: 'border', components: [
      { component: 'border-width', origin: 'token', tokens: ['stroke.hairline'], dataType: 'length', evidence: { level: 'environments', environments: ['scheme=light', 'scheme=dark'] } },
      { component: 'border-style', origin: 'literal', tokens: [], dataType: 'unknown', grammarType: 'line-style', evidence: { level: 'environments', environments: ['base'] } },
      { component: 'border-color', origin: 'token', tokens: ['color.edge'], dataType: 'color', evidence: { level: 'type' } },
    ] },
    { property: 'border', components: [
      { component: 'border-width', origin: 'literal', tokens: [], dataType: 'length', evidence: { level: 'environments', environments: ['base'] } },
      { component: 'border-style', origin: 'literal', tokens: [], dataType: 'unknown', grammarType: 'line-style', evidence: { level: 'environments', environments: ['base'] } },
      { component: 'border-color', origin: 'token', tokens: ['space.md'], dataType: 'length', evidence: { level: 'environments', environments: ['base'], result: 'incompatible' } },
    ] },
    { property: 'color', components: [{ component: 'color', origin: 'literal', tokens: [], dataType: 'color', evidence: { level: 'environments', environments: ['base'] } }], identity: 'A val-reference interpolation is indistinguishable from the equal literal' },
    { property: 'padding', components: [{ component: 'padding', origin: 'external', tokens: [], dataType: 'unknown', evidence: { level: 'unresolved', reason: 'External substitution' } }] },
  ]
  return { width, color, wrong, records, invalid: inspectDeclaration('border', '1px solid 8px') }
}
