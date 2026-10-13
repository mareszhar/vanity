// Preview is an edit over the fixture's one ordered declaration graph.
export function createPreview(graph, sheets) {
  const flatten = rules => [...rules].flatMap(rule => [
    ...(rule instanceof CSSStyleRule ? [rule] : []),
    ...('cssRules' in rule ? flatten(rule.cssRules) : []),
  ])
  const rules = [...sheets].flatMap(sheet => flatten(sheet.cssRules))
  const changes = new Map()
  const originals = new Map()
  function locate(arm) {
    const matches = rules.filter(rule => rule.selectorText === arm.selector)
    if (matches.length !== 1)
      throw new Error(`unresolved CSSOM arm: ${arm.selector} (${matches.length} matches)`)
    return matches[0]
  }
  function replay(arm) {
    const rule = locate(arm)
    if (!originals.has(rule))
      originals.set(rule, rule.style.cssText)
    rule.style.cssText = arm.declarations.map(declaration => `${declaration.property}:${changes.get(declaration.id) ?? declaration.value}${declaration.priority ? ` !${declaration.priority}` : ''}`).join(';')
  }
  return {
    set(id, value) {
      const arm = graph.arms.find(arm => arm.declarations.some(declaration => declaration.id === id))
      if (!arm)
        throw new Error(`unknown declaration ${id}`)
      changes.set(id, value)
      replay(arm)
    },
    reset(id) {
      if (id === undefined) {
        changes.clear()
        for (const [rule, value] of originals) rule.style.cssText = value
        originals.clear()
        return
      }
      const arm = graph.arms.find(arm => arm.declarations.some(declaration => declaration.id === id))
      if (!arm)
        throw new Error(`unknown declaration ${id}`)
      changes.delete(id)
      replay(arm)
    },
  }
}
