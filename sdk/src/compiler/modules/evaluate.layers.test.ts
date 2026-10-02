import { describe, expect, it } from 'vitest'
import { createSystem } from '../../index'
import { evaluateStyleModule } from './evaluate'

const systemOrder = [
  'fixture',
  'fixture.reset',
  'fixture.tokens',
  'fixture.recipes',
  'fixture.utilities',
  'fixture.overrides',
  'fixture.tokens.base',
  'fixture.tokens.axes',
  'fixture.tokens.cases',
]

function expectSystemHeader(css: string, root = 'fixture'): void {
  const names = systemOrder.map(name => name.replace('fixture', root))
  let position = -1
  for (const name of names) {
    const next = css.indexOf(`@layer ${name};`)
    expect(next, `${name} must precede every rule in this stylesheet`).toBeGreaterThan(position)
    position = next
  }
  expect(position).toBeLessThan(css.indexOf('{'))
}

function cssFor(operation: string, systems: Record<string, unknown>): string[] {
  const result = evaluateStyleModule(
    `const { ds, second } = require('systems'); ${operation}`,
    '/fixture/style.css.ts',
    'debug',
    new Map([['systems', systems]]),
  )
  const stylesheets = [...result.cssByFileScope.values()]
  expect(stylesheets.length).toBeGreaterThan(0)
  return stylesheets
}

describe('system layer declarations in each compiler file scope', () => {
  const emissions = [
    ['class', `ds.class({ color: 'red' }, 'card')`],
    ['recipe', `ds.recipe({ base: { color: 'red' } }, 'card')`],
    ['anatomy', `ds.anatomy({ parts: ['root'], base: { root: { color: 'red' } } }, 'card')`],
    ['atoms', `ds.atoms({ properties: { color: ['red'] } }, 'colors')`],
    ['rules', `ds.rules({ '.card': { color: 'red' } })`],
    ['keyframes', `ds.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } }, 'fade')`],
    ['fontFace', `ds.fontFace({ src: 'url(/font.woff2)' }, 'body')`],
    ['raw', `ds.raw('.card { color: red }')`],
  ] as const

  it.each(emissions)('%s can emit first without making its own layer first', (_name, operation) => {
    const ds = createSystem().consolidate({ prefix: 'fixture' })
    cssFor(`ds.class({ color: 'black' })`, { ds })
    for (const css of cssFor(operation, { ds }))
      expectSystemHeader(css)
  })

  it.each(emissions)('%s through inLayer declares the full order', (_name, operation) => {
    const ds = createSystem().consolidate({ prefix: 'fixture' })
    cssFor(`ds.class({ color: 'black' })`, { ds })
    for (const css of cssFor(operation.replaceAll('ds.', `ds.inLayer('overrides').`), { ds }))
      expectSystemHeader(css)
  })

  it('declares both systems in a stylesheet using both', () => {
    const ds = createSystem().consolidate({ prefix: 'fixture' })
    const second = createSystem().consolidate({ prefix: 'second' })
    cssFor(`ds.class({ color: 'black' }); second.class({ color: 'white' })`, { ds, second })
    for (const css of cssFor(`ds.class({ color: 'red' }); second.class({ color: 'blue' })`, { ds, second })) {
      expectSystemHeader(css)
      expectSystemHeader(css, 'second')
    }
  })

  it('declares both systems before a raw-first stylesheet emits a rule', () => {
    const ds = createSystem().consolidate({ prefix: 'fixture' })
    const second = createSystem().consolidate({ prefix: 'second' })
    cssFor(`ds.class({ color: 'black' }); second.class({ color: 'white' })`, { ds, second })
    for (const css of cssFor(`ds.raw('.card { color: red }'); second.class({ color: 'blue' })`, { ds, second })) {
      expectSystemHeader(css)
      expectSystemHeader(css, 'second')
    }
  })

  it('declares the order again when the same module is evaluated a second time', () => {
    const ds = createSystem().consolidate({ prefix: 'fixture' })
    const first = cssFor(`ds.class({ color: 'red' })`, { ds })
    const second = cssFor(`ds.class({ color: 'blue' })`, { ds })
    for (const css of [...first, ...second])
      expectSystemHeader(css)
  })
})
