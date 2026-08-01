/**
 * A tiny reader for machine-generated CSS — the substrate's `transformCss`
 * output and lightningcss's flattened output are both well-formed and
 * comment-light, which is all this handles. Shared by `css.raw` (re-reading
 * the flattened escape block) and the audits (walking emitted declarations).
 */

export type VanityFlatNode
  = | { kind: 'rule', selector: string, declarations: Array<[string, string]> }
    | { kind: 'at', prelude: string, children: VanityFlatNode[] }

export function parseBlocks(css: string): VanityFlatNode[] {
  const nodes: VanityFlatNode[] = []
  const text = stripComments(css)
  let cursor = 0

  while (cursor < text.length) {
    const open = text.indexOf('{', cursor)

    if (open === -1)
      break

    const prelude = text.slice(cursor, open).trim()
    const close = matchBrace(text, open)
    const body = text.slice(open + 1, close)
    cursor = close + 1

    if (prelude.startsWith('@')) {
      nodes.push({ kind: 'at', prelude, children: parseBlocks(body) })
    }
    else {
      nodes.push({
        kind: 'rule',
        selector: prelude,
        declarations: body
          .split(';')
          .map(entry => entry.trim())
          .filter(entry => entry.length > 0 && entry.includes(':'))
          .map((entry) => {
            const colon = entry.indexOf(':')
            return [entry.slice(0, colon).trim(), entry.slice(colon + 1).trim()] as [string, string]
          }),
      })
    }
  }

  return nodes
}

function matchBrace(css: string, open: number): number {
  let depth = 0

  for (let index = open; index < css.length; index++) {
    if (css[index] === '{')
      depth++
    else if (css[index] === '}' && --depth === 0)
      return index
  }

  return css.length
}

function stripComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, '')
}

/** Every declaration under every at-rule, with its owning selector. */
export function walkDeclarations(
  nodes: VanityFlatNode[],
  visit: (selector: string, property: string, value: string) => void,
): void {
  for (const node of nodes) {
    if (node.kind === 'at') {
      walkDeclarations(node.children, visit)
      continue
    }

    for (const [property, value] of node.declarations)
      visit(node.selector, property, value)
  }
}
