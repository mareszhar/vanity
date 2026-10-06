import { cursor, defineProject } from '@mszr/selenita/vitest'
import { describe, expect, it } from 'vitest'

const project = defineProject({ tsconfig: './tsconfig.json', aliases: { '#src/*': './src/*' } })

describe('p1/P2 — additive accumulation is visible to later callbacks', () => {
  it('derive() sees groups added earlier', () => {
    const observation = project.query`
      import { create } from '#src/builder'
      create()
        .add('color', { brand: 'red' })
        .add('space', { md: 'x' })
        .derive(shape => { shape.${cursor}; return {} })
    `
    expect(observation).toSuggest('color')
    expect(observation).toSuggest('space')
  })

  it('fields of an accumulated group are visible', () => {
    const observation = project.query`
      import { create } from '#src/builder'
      create()
        .add('color', { brand: 'red', ink: 'black' })
        .derive(shape => { shape.color.${cursor}; return {} })
    `
    expect(observation).toSuggest('brand')
    expect(observation).toSuggest('ink')
  })
})

describe('p3 — a field may be a value OR a callback; both resolve to the value type', () => {
  it('a callback field resolves to its return type in the accumulated shape', () => {
    const observation = project.query`
      import { create } from '#src/builder'
      create()
        .add('color', { brand: 'red', ink: tools => tools.unit(1) }) // ink via callback
        .derive(shape => {
          const s: string = shape.color.ink // callback field resolved to string
          shape.color.${cursor}
          return { s: {} }
        })
    `
    expect(observation).toSuggest('brand')
    expect(observation).toSuggest('ink')
  })

  it('the unfinished callback receives typed tools after native diagnostics', () => {
    const observation = project.query`
      import { create } from '#src/builder'
      create().add('space', { md: tools => tools.${cursor} })
    `
    // Native TypeScript resolves this reverse-mapped callback's context during
    // semantic diagnostics. Observe that before requesting its completions.
    expect(observation).toHaveErrorCount(1)
    expect(observation).toHaveError(1003)
    expect(observation).toSuggest('unit')
  })
})

describe('p4 — structural additive requirement with a readable error', () => {
  it('satisfied (extra fields allowed) → clean', () => {
    const { errors } = project.check`
      import { create, contribution } from '#src/builder'
      const plugin = contribution({
        id: 'p', requires: { color: ['brand', 'ink'] }, provides: { motion: { on: 'x' } },
      })
      create().add('color', { brand: 'red', ink: 'black', muted: 'grey' }).use(plugin)
    `
    expect(errors.length).toBe(0)
  })

  it('unmet → error names the missing field(s)', () => {
    const { errors } = project.check`
      import { create, contribution } from '#src/builder'
      const plugin = contribution({
        id: 'p', requires: { color: ['brand', 'ink'] }, provides: {},
      })
      create().add('color', { brand: 'red' }).use(plugin) // missing 'ink'
    `
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.map(e => e.message).join('\n')).toContain('missing field(s): ink')
  })

  it('missing group entirely → readable', () => {
    const { errors } = project.check`
      import { create, contribution } from '#src/builder'
      const plugin = contribution({ id: 'p', requires: { color: ['brand'] }, provides: {} })
      create().use(plugin)
    `
    expect(errors.map(e => e.message).join('\n')).toContain('group \'color\' is not present')
  })

  it('a contribution that PROVIDES a group makes it visible downstream', () => {
    const observation = project.query`
      import { create, contribution } from '#src/builder'
      const plugin = contribution({ id: 'p', requires: {}, provides: { motion: { on: 'x', off: 'y' } } })
      create().use(plugin).derive(shape => { shape.${cursor}; return {} })
    `
    expect(observation).toSuggest('motion')
  })
})

describe('p5 — consolidate() drops the mutation methods', () => {
  it('read is present, add/derive/use/consolidate are gone', () => {
    const observation = project.query`
      import { create } from '#src/builder'
      const consolidated = create().add('color', { brand: 'red' }).consolidate()
      consolidated.${cursor}
    `
    expect(observation).toSuggest('read')
    expect(observation).not.toSuggest('add')
    expect(observation).not.toSuggest('use')
    expect(observation).not.toSuggest('consolidate')
  })
})
